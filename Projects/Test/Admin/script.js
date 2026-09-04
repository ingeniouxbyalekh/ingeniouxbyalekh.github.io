import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, remove, onValue, query, orderByChild, limitToLast,
  runTransaction, push, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

// ---- primary database: contact messages, admin password, login rate-limit state ----
const firebaseConfig = {
  apiKey: "AIzaSyAkYWiiqp_nQc7wRE31CH3E0l0wlM-JQ9Y",
  authDomain: "ingenioux-55f27.firebaseapp.com",
  databaseURL: "https://ingenioux-55f27-default-rtdb.firebaseio.com",
  projectId: "ingenioux-55f27",
  storageBucket: "ingenioux-55f27.firebasestorage.app",
  messagingSenderId: "514072384167",
  appId: "1:514072384167:web:d2e3a4c8c024abed924182"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---- visitor database: visitor logs, total visitor count, failed-login detail logs ----
const visitorFirebaseConfig = {
  apiKey: "AIzaSyBFkN8erxsvRRAwMipQu7xZGLeXsQu9E_w",
  authDomain: "ingenioux-visitor.firebaseapp.com",
  databaseURL: "https://ingenioux-visitor-default-rtdb.firebaseio.com",
  projectId: "ingenioux-visitor",
  storageBucket: "ingenioux-visitor.firebasestorage.app",
  messagingSenderId: "426646415346",
  appId: "1:426646415346:web:38373322949588eb14ed6b"
};

const visitorApp = initializeApp(visitorFirebaseConfig, 'visitor');
const dbVisitor = getDatabase(visitorApp);

const ADMIN_PATH = 'adminConfig/passwordHash';
const MESSAGES_PATH = 'contactMessages';
const VISITORS_PATH = 'visitors';
const LOGIN_ATTEMPTS_PATH = 'loginAttempts';   // per ip/device: current fail count + block state
const LOGIN_LOGS_PATH = 'loginAttemptLogs';    // flat history of every failed attempt, for the admin table
const ACTIVE_SESSION_PATH = 'adminConfig/activeSession'; // single-device login enforcement
const MAX_LOGIN_ATTEMPTS = 3;
const LOGIN_BLOCK_MS = 60 * 60 * 1000; // 1 hour
const SESSION_KEY = 'ingenioux_admin_session';
const SESSION_ID_KEY = 'ingenioux_admin_session_id';

function genSessionId(){
  return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(16) + Math.random().toString(16).slice(2));
}

// ---------- helpers ----------
async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Fails a hung request after this long so buttons never get stuck forever.
function withTimeout(promise, ms){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

function friendlyError(err){
  if(err && err.message === 'timeout') return 'This is taking too long — check your connection and try again.';
  if(err && err.code === 'PERMISSION_DENIED') return 'Blocked by database rules — check your Realtime Database rules.';
  return 'Something went wrong. Please try again.';
}

function setStatus(el, msg, type){
  el.textContent = msg;
  el.classList.remove('is-success','is-error');
  if(type) el.classList.add(type === 'success' ? 'is-success' : 'is-error');
}

function formatDate(ts){
  if(!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function escapeHtml(str){
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---------- caller identity (for login rate-limiting) ----------
// Firebase RTDB keys can't contain . # $ [ ] /
function sanitizeKey(str){
  return String(str).replace(/[.#$\[\]/]/g, '_');
}

function getOrCreateDeviceId(){
  let id = localStorage.getItem('ingenioux_admin_device_id');
  if(!id){
    id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(16) + Math.random().toString(16).slice(2)));
    localStorage.setItem('ingenioux_admin_device_id', id);
  }
  return id;
}

// Very small user-agent parser — good enough for admin display, not meant to be exhaustive.
function parseUserAgent(ua){
  let browser = 'Unknown';
  if(/Edg\//.test(ua)) browser = 'Edge';
  else if(/OPR\//.test(ua)) browser = 'Opera';
  else if(/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if(/Firefox\//.test(ua)) browser = 'Firefox';
  else if(/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  let os = 'Unknown';
  if(/Windows NT/.test(ua)) os = 'Windows';
  else if(/Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)) os = 'macOS';
  else if(/Android/.test(ua)) os = 'Android';
  else if(/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if(/Linux/.test(ua)) os = 'Linux';

  let deviceType = 'Desktop';
  if(/iPad|Tablet/.test(ua)) deviceType = 'Tablet';
  else if(/Mobi|Android/.test(ua)) deviceType = 'Mobile';

  return { browser, os, deviceType };
}

// Resolved once per page load — IP/geo lookup is best-effort; falls back to a
// per-browser device id (localStorage) so blocking still works if it fails.
async function resolveVisitorInfo(){
  const ua = navigator.userAgent;
  const device = parseUserAgent(ua);
  let geo = {};
  try{
    const res = await withTimeout(fetch('https://ipwho.is/'), 6000);
    const data = await res.json();
    if(data && data.success !== false){
      geo = {
        ip: data.ip || null,
        city: data.city || null,
        region: data.region || null,
        country: data.country || null,
        countryCode: data.country_code || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        timezone: (data.timezone && data.timezone.id) || null,
        isp: (data.connection && (data.connection.isp || data.connection.org)) || null
      };
    }
  }catch(err){
    console.warn('Admin geo lookup failed:', err);
  }
  const key = geo.ip ? ('ip_' + sanitizeKey(geo.ip)) : ('device_' + getOrCreateDeviceId());
  return { ...geo, userAgent: ua, browser: device.browser, os: device.os, deviceType: device.deviceType, key };
}

const visitorInfoPromise = resolveVisitorInfo();

// ---------- elements ----------
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');
const logoutBtn = document.getElementById('logoutBtn');

const togglePasswordPanel = document.getElementById('togglePasswordPanel');
const passwordPanel = document.getElementById('passwordPanel');
const savePasswordBtn = document.getElementById('savePasswordBtn');
const passwordStatus = document.getElementById('passwordStatus');

const msgList = document.getElementById('msgList');
const msgLoading = document.getElementById('msgLoading');
const statTotal = document.getElementById('statTotal');
const statUnread = document.getElementById('statUnread');
const filterBtns = document.querySelectorAll('.msg-filter button');

const visitorsLoading = document.getElementById('visitorsLoading');
const visitorTableWrap = document.getElementById('visitorTableWrap');
const visitorTableBody = document.getElementById('visitorTableBody');
const statVisitors = document.getElementById('statVisitors');
const statVisitorsToday = document.getElementById('statVisitorsToday');
const clearVisitorsBtn = document.getElementById('clearVisitorsBtn');
const visitorIpFilter = document.getElementById('visitorIpFilter');
const visitorIpList = document.getElementById('visitorIpList');
const visitorRegionFilter = document.getElementById('visitorRegionFilter');
const visitorRegionList = document.getElementById('visitorRegionList');
const visitorCityFilter = document.getElementById('visitorCityFilter');
const visitorCityList = document.getElementById('visitorCityList');
const visitorPostalFilter = document.getElementById('visitorPostalFilter');
const visitorPostalList = document.getElementById('visitorPostalList');
const visitorDateFrom = document.getElementById('visitorDateFrom');
const visitorDateTo = document.getElementById('visitorDateTo');
const visitorDeviceFilter = document.getElementById('visitorDeviceFilter');
const visitorFilterSearch = document.getElementById('visitorFilterSearch');
const visitorFilterReset = document.getElementById('visitorFilterReset');
const visitorFilterCount = document.getElementById('visitorFilterCount');

const loginLogsLoading = document.getElementById('loginLogsLoading');
const loginLogsTableWrap = document.getElementById('loginLogsTableWrap');
const loginLogsTableBody = document.getElementById('loginLogsTableBody');
const clearLoginLogsBtn = document.getElementById('clearLoginLogsBtn');

let currentFilter = 'all';
let allMessages = [];
let allVisitorsCache = [];
let messagesListenerAttached = false;
let visitorsListenerAttached = false;
let loginLogsListenerAttached = false;
let unsubscribeActiveSession = null;

// ---------- auth flow ----------
function showDashboard(){
  loginScreen.style.display = 'none';
  dashboard.style.display = 'block';
  startMessagesListener();
  startVisitorsListener();
  startLoginLogsListener();
  startActiveSessionListener();
}
function showLogin(){
  dashboard.style.display = 'none';
  loginScreen.style.display = 'flex';
}

// ---------- single-device login enforcement ----------
// Whoever logs in most recently writes their sessionId to ACTIVE_SESSION_PATH.
// Every logged-in tab listens on that path in realtime; if it ever sees a
// sessionId that isn't its own, someone else has logged in elsewhere, so this
// device is signed out immediately with an explanatory message.
function startActiveSessionListener(){
  if(unsubscribeActiveSession) return; // already listening
  unsubscribeActiveSession = onValue(ref(db, ACTIVE_SESSION_PATH), (snapshot)=>{
    const mySessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if(!mySessionId) return; // not logged in on this device (yet) — ignore
    const active = snapshot.val();
    if(active && active.sessionId && active.sessionId !== mySessionId){
      handleKickedOut(active);
    }
  }, (err)=>{
    console.warn('Active session listener error:', err);
  });
}

function stopActiveSessionListener(){
  if(unsubscribeActiveSession){
    unsubscribeActiveSession();
    unsubscribeActiveSession = null;
  }
}

function handleKickedOut(active){
  stopActiveSessionListener();
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_ID_KEY);
  showLogin();
  const device = [active.browser, active.os].filter(Boolean).join(' / ');
  const loc = [active.city, active.country].filter(Boolean).join(', ');
  const detail = [device, loc].filter(Boolean).join(' · ');
  setStatus(loginStatus, `You were logged out — this admin account signed in on another device${detail ? ' (' + detail + ')' : ''}.`, 'error');
}

// On page load, don't just trust the local sessionStorage flag — check whether
// a *different* device has since taken over the session (e.g. this tab was
// left open in the background while someone logged in elsewhere).
async function checkExistingSession(){
  if(sessionStorage.getItem(SESSION_KEY) !== 'true'){
    showLogin();
    return;
  }
  const mySessionId = sessionStorage.getItem(SESSION_ID_KEY);
  try{
    const snap = await withTimeout(get(ref(db, ACTIVE_SESSION_PATH)), 8000);
    const active = snap.val();
    if(active && active.sessionId && active.sessionId !== mySessionId){
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_ID_KEY);
      showLogin();
      const device = [active.browser, active.os].filter(Boolean).join(' / ');
      const loc = [active.city, active.country].filter(Boolean).join(', ');
      const detail = [device, loc].filter(Boolean).join(' · ');
      setStatus(loginStatus, `You were logged out — this admin account signed in on another device${detail ? ' (' + detail + ')' : ''}.`, 'error');
      return;
    }
    showDashboard();
  }catch(err){
    // Can't verify (offline, etc.) — fall back to trusting the local session
    // rather than locking the admin out.
    console.warn('Active session check failed:', err);
    showDashboard();
  }
}

function wireCollapse(btnId){
  const btn = document.getElementById(btnId);
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    const panel = btn.closest('.panel');
    const collapsed = panel.classList.toggle('collapsed');
    btn.textContent = collapsed ? '+' : '×';
    btn.setAttribute('aria-label', (collapsed ? 'Expand' : 'Minimize') + ' list');
  });
}
wireCollapse('msgPanelToggle');
wireCollapse('visitorPanelToggle');
wireCollapse('loginLogsPanelToggle');

checkExistingSession();

loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const pwd = document.getElementById('adminPassword').value;
  if(!pwd){ setStatus(loginStatus, 'Enter a password.', 'error'); return; }

  loginBtn.disabled = true;
  setStatus(loginStatus, 'Checking…', null);

  try{
    const info = await withTimeout(visitorInfoPromise, 8000)
      .catch(()=> ({ key: 'device_' + getOrCreateDeviceId() }));
    const attemptsRef = ref(db, `${LOGIN_ATTEMPTS_PATH}/${info.key}`);

    // Block check happens before anything else — a correct password doesn't bypass a block.
    const attemptsSnap = await withTimeout(get(attemptsRef), 10000);
    const attemptsState = attemptsSnap.val() || {};
    const now = Date.now();
    if(attemptsState.blockedUntil && attemptsState.blockedUntil > now){
      const mins = Math.ceil((attemptsState.blockedUntil - now) / 60000);
      setStatus(loginStatus, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 'error');
      loginBtn.disabled = false;
      return;
    }

    const snap = await withTimeout(get(ref(db, ADMIN_PATH)), 10000);
    const hash = await sha256(pwd);
    let success = false;

    if(!snap.exists()){
      // first-time setup: whatever is entered becomes the admin password
      await withTimeout(set(ref(db, ADMIN_PATH), hash), 10000);
      success = true;
      setStatus(loginStatus, 'Admin password created. Logging in…', 'success');
    }else if(snap.val() === hash){
      success = true;
    }

    if(success){
      await withTimeout(remove(attemptsRef), 10000).catch(()=>{}); // clear any prior fail count on success

      // Claim the single admin session. Writing this immediately trips the
      // active-session listener on any other device that's currently logged
      // in, logging it out there.
      const mySessionId = genSessionId();
      sessionStorage.setItem(SESSION_KEY, 'true');
      sessionStorage.setItem(SESSION_ID_KEY, mySessionId);
      await withTimeout(set(ref(db, ACTIVE_SESSION_PATH), {
        sessionId: mySessionId,
        ip: info.ip || null,
        city: info.city || null,
        region: info.region || null,
        country: info.country || null,
        browser: info.browser || null,
        os: info.os || null,
        deviceType: info.deviceType || null,
        loginAt: serverTimestamp()
      }), 10000).catch(err => console.warn('Failed to record active session:', err));

      loginForm.reset();
      setStatus(loginStatus, '', null);
      showDashboard();
      return;
    }

    // ---- wrong password: bump the counter and, at 3, block for an hour ----
    const txResult = await withTimeout(runTransaction(attemptsRef, (current)=>{
      const c = current || {};
      const stillBlocked = c.blockedUntil && c.blockedUntil > now;
      if(stillBlocked) return c;
      const newCount = (c.failCount || 0) + 1;
      const blockedUntil = newCount >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_BLOCK_MS : null;
      return {
        failCount: blockedUntil ? 0 : newCount,
        blockedUntil,
        lastAttempt: now,
        ip: info.ip || null
      };
    }), 10000);

    const updated = txResult.snapshot.val() || {};
    const gotBlocked = !!updated.blockedUntil;

    // Log the attempt with visitor details — never the password itself.
    withTimeout(push(ref(dbVisitor, LOGIN_LOGS_PATH), {
      ip: info.ip || null,
      city: info.city || null,
      region: info.region || null,
      country: info.country || null,
      countryCode: info.countryCode || null,
      latitude: info.latitude ?? null,
      longitude: info.longitude ?? null,
      timezone: info.timezone || null,
      isp: info.isp || null,
      browser: info.browser || null,
      os: info.os || null,
      deviceType: info.deviceType || null,
      userAgent: info.userAgent || null,
      blocked: gotBlocked,
      createdAt: serverTimestamp()
    }), 10000).catch(err => console.warn('Failed to log login attempt:', err));

    if(gotBlocked){
      setStatus(loginStatus, 'Too many failed attempts. Blocked for 1 hour.', 'error');
    }else{
      const remaining = MAX_LOGIN_ATTEMPTS - (updated.failCount || 0);
      setStatus(loginStatus, `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`, 'error');
    }
  }catch(err){
    console.error('Admin login error:', err);
    setStatus(loginStatus, friendlyError(err), 'error');
  }finally{
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async ()=>{
  const mySessionId = sessionStorage.getItem(SESSION_ID_KEY);
  stopActiveSessionListener();
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_ID_KEY);
  showLogin();
  try{
    // Only clear the shared record if it's still ours — if another device
    // already took over the session, don't log that device out too.
    const snap = await withTimeout(get(ref(db, ACTIVE_SESSION_PATH)), 8000);
    const active = snap.val();
    if(active && active.sessionId === mySessionId){
      await withTimeout(remove(ref(db, ACTIVE_SESSION_PATH)), 8000);
    }
  }catch(err){
    console.warn('Failed to clear active session on logout:', err);
  }
});

// ---------- change password ----------
togglePasswordPanel.addEventListener('click', ()=>{
  passwordPanel.style.display = passwordPanel.style.display === 'none' ? 'block' : 'none';
});

savePasswordBtn.addEventListener('click', async ()=>{
  const current = document.getElementById('currentPassword').value;
  const next = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;

  if(!current || !next || !confirm){
    setStatus(passwordStatus, 'Fill in all fields.', 'error'); return;
  }
  if(next !== confirm){
    setStatus(passwordStatus, 'New passwords do not match.', 'error'); return;
  }
  if(next.length < 6){
    setStatus(passwordStatus, 'New password should be at least 6 characters.', 'error'); return;
  }

  savePasswordBtn.disabled = true;
  setStatus(passwordStatus, 'Saving…', null);

  try{
    const snap = await withTimeout(get(ref(db, ADMIN_PATH)), 10000);
    const currentHash = await sha256(current);
    if(snap.exists() && snap.val() !== currentHash){
      setStatus(passwordStatus, 'Current password is incorrect.', 'error');
      savePasswordBtn.disabled = false;
      return;
    }
    const newHash = await sha256(next);
    await withTimeout(set(ref(db, ADMIN_PATH), newHash), 10000);
    setStatus(passwordStatus, 'Password updated.', 'success');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  }catch(err){
    console.error('Change password error:', err);
    setStatus(passwordStatus, friendlyError(err), 'error');
  }finally{
    savePasswordBtn.disabled = false;
  }
});

// ---------- messages ----------
function startMessagesListener(){
  if(messagesListenerAttached) return;
  messagesListenerAttached = true;

  msgLoading.style.display = 'block';
  msgLoading.classList.remove('is-error');
  msgLoading.textContent = 'Loading messages…';

  const messagesQuery = query(ref(db, MESSAGES_PATH), orderByChild('createdAt'));
  onValue(messagesQuery, (snapshot)=>{
    const val = snapshot.val() || {};
    allMessages = Object.keys(val)
      .map(id => ({ id, ...val[id] }))
      .reverse(); // orderByChild is ascending; newest first
    msgLoading.style.display = 'none';
    renderMessages();
  }, (err)=>{
    console.error('Messages listener error:', err);
    msgLoading.style.display = 'block';
    msgLoading.classList.add('is-error');
    msgLoading.textContent = friendlyError(err) + ' (' + (err.code || 'unknown') + ')';
  });
}

function renderMessages(){
  const total = allMessages.length;
  const unread = allMessages.filter(m => !m.read).length;
  statTotal.textContent = total;
  statUnread.textContent = unread;

  let list = allMessages;
  if(currentFilter === 'unread') list = allMessages.filter(m => !m.read);
  if(currentFilter === 'read') list = allMessages.filter(m => m.read);

  if(list.length === 0){
    msgList.innerHTML = `<div class="msg-empty">No messages ${currentFilter === 'all' ? 'yet' : 'in this view'}.</div>`;
    return;
  }

  msgList.innerHTML = list.map(m => `
    <div class="msg-card ${!m.read ? 'is-unread' : ''}" data-id="${m.id}">
      <div class="msg-head">
        <div class="msg-who">${escapeHtml(m.name) || 'Unknown'} ${!m.read ? '<span class="badge">Unread</span>' : ''}</div>
        <div class="msg-meta">${formatDate(m.createdAt)}</div>
      </div>
      <div class="msg-contact">
        ${m.email ? `<a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a>` : ''}
        ${m.phone ? ` · ${escapeHtml(m.phone)}` : ''}
      </div>
      <div class="msg-subject">${escapeHtml(m.subject) || 'No subject'}</div>
      <div class="msg-body">${escapeHtml(m.message)}</div>
      <div class="msg-actions">
        ${!m.read ? `<button class="btn btn-small mark-read-btn">Mark as read</button>` : `<button class="btn btn-small" disabled>Read</button>`}
        <button class="btn btn-small btn-danger clear-btn">Clear</button>
      </div>
    </div>
  `).join('');
}

msgList.addEventListener('click', async (e)=>{
  const card = e.target.closest('.msg-card');
  if(!card) return;
  const id = card.dataset.id;

  if(e.target.classList.contains('mark-read-btn')){
    e.target.disabled = true;
    try{
      await withTimeout(update(ref(db, `${MESSAGES_PATH}/${id}`), { read: true }), 10000);
    }catch(err){
      console.error('Mark as read error:', err);
      alert(friendlyError(err));
      e.target.disabled = false;
    }
  }

  if(e.target.classList.contains('clear-btn')){
    if(!confirm('Delete this message permanently?')) return;
    e.target.disabled = true;
    try{
      await withTimeout(remove(ref(db, `${MESSAGES_PATH}/${id}`)), 10000);
    }catch(err){
      console.error('Delete message error:', err);
      alert(friendlyError(err));
      e.target.disabled = false;
    }
  }
});

filterBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    filterBtns.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderMessages();
  });
});

// ---------- visitors ----------
function startVisitorsListener(){
  if(visitorsListenerAttached) return;
  visitorsListenerAttached = true;

  visitorsLoading.style.display = 'block';
  visitorsLoading.classList.remove('is-error');
  visitorsLoading.textContent = 'Loading visitors…';

  // Cap at the most recent 500 so a busy site doesn't pull the whole table into the browser.
  const visitorsQuery = query(ref(dbVisitor, VISITORS_PATH), orderByChild('createdAt'), limitToLast(500));
  onValue(visitorsQuery, (snapshot)=>{
    const val = snapshot.val() || {};
    allVisitorsCache = Object.keys(val)
      .map(id => ({ id, ...val[id] }))
      .reverse(); // orderByChild is ascending; newest first
    visitorsLoading.style.display = 'none';
    updateVisitorStats();
    populateFilterSuggestions();
    applyVisitorFilters();
  }, (err)=>{
    console.error('Visitors listener error:', err);
    visitorsLoading.style.display = 'block';
    visitorsLoading.classList.add('is-error');
    visitorsLoading.textContent = friendlyError(err) + ' (' + (err.code || 'unknown') + ')';
  });
}

function locationLabel(v){
  const parts = [v.city, v.region, v.country].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

// Returns a clickable pin icon (opens Google Maps in a new tab at the stored
// lat/long) when coordinates exist, or an em-dash placeholder when they don't.
function locationPinIcon(v){
  const lat = Number(v.latitude);
  const lng = Number(v.longitude);
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  const title = `Open location on Google Maps (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  return `<a class="v-pin" href="${url}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" onclick="event.stopPropagation()">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="12" cy="9" r="2.4" stroke="currentColor" stroke-width="1.6"/>
    </svg>
  </a>`;
}

function updateVisitorStats(){
  statVisitors.textContent = allVisitorsCache.length;
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  statVisitorsToday.textContent = allVisitorsCache.filter(v => v.createdAt && v.createdAt >= todayStart.getTime()).length;
}

// Builds <datalist> suggestions straight from what's actually in the Visitors table, A→Z.
function uniqueSorted(values){
  return [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b));
}

function populateFilterSuggestions(){
  const ips = uniqueSorted(allVisitorsCache.map(v => v.ip));
  const regions = uniqueSorted(allVisitorsCache.map(v => v.region));
  const cities = uniqueSorted(allVisitorsCache.map(v => v.city));
  const postals = uniqueSorted(allVisitorsCache.map(v => v.postal));

  visitorIpList.innerHTML = ips.map(i => `<option value="${escapeHtml(i)}"></option>`).join('');
  visitorRegionList.innerHTML = regions.map(r => `<option value="${escapeHtml(r)}"></option>`).join('');
  visitorCityList.innerHTML = cities.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
  visitorPostalList.innerHTML = postals.map(p => `<option value="${escapeHtml(p)}"></option>`).join('');
}

// Each field checks only its own data. When more than one field has a value,
// results must match ALL of them (AND), not just any one.
function applyVisitorFilters(){
  const ip = visitorIpFilter.value.trim().toLowerCase();
  const region = visitorRegionFilter.value.trim().toLowerCase();
  const city = visitorCityFilter.value.trim().toLowerCase();
  const postal = visitorPostalFilter.value.trim().toLowerCase();
  const from = visitorDateFrom.value ? new Date(visitorDateFrom.value + 'T00:00:00').getTime() : null;
  const to = visitorDateTo.value ? new Date(visitorDateTo.value + 'T23:59:59').getTime() : null;
  const device = visitorDeviceFilter.value;

  let filtered = allVisitorsCache;
  if(ip) filtered = filtered.filter(v => (v.ip || '').toLowerCase().includes(ip));
  if(region) filtered = filtered.filter(v => (v.region || '').toLowerCase().includes(region));
  if(city) filtered = filtered.filter(v => (v.city || '').toLowerCase().includes(city));
  if(postal) filtered = filtered.filter(v => (v.postal || '').toLowerCase().includes(postal));
  if(from) filtered = filtered.filter(v => v.createdAt && v.createdAt >= from);
  if(to) filtered = filtered.filter(v => v.createdAt && v.createdAt <= to);
  if(device) filtered = filtered.filter(v => v.deviceType === device);

  const isFiltering = ip || region || city || postal || from || to || device;
  visitorFilterCount.textContent = isFiltering ? `Showing ${filtered.length} of ${allVisitorsCache.length}` : '';
  renderVisitorTable(filtered);
}

function renderVisitorTable(list){
  if(list.length === 0){
    visitorTableWrap.style.display = 'none';
    visitorsLoading.style.display = 'block';
    visitorsLoading.classList.remove('is-error');
    visitorsLoading.textContent = allVisitorsCache.length === 0 ? 'No visitors logged yet.' : 'No visitors match these filters.';
    return;
  }

  visitorsLoading.style.display = 'none';
  visitorTableWrap.style.display = 'block';

  visitorTableBody.innerHTML = list.map(v => `
    <div class="visitor-tile">
      <div class="v-row v-row-top">
        <span class="v-num">#${v.visitorNumber ?? '—'}</span>
        <span class="v-time">${formatDate(v.createdAt)}</span>
        <span class="v-device">${escapeHtml(v.deviceType) || '—'}</span>
      </div>
      <div class="v-row">
        <span class="v-item"><b>IP</b>${escapeHtml(v.ip) || '—'}</span>
        <span class="v-item"><b>Location</b>${escapeHtml(locationLabel(v))}${locationPinIcon(v)}</span>
        <span class="v-item"><b>Postal</b>${escapeHtml(v.postal) || '—'}</span>
      </div>
      <div class="v-row">
        <span class="v-item"><b>Browser/OS</b>${escapeHtml([v.browser, v.os].filter(Boolean).join(' / ')) || '—'}</span>
        <span class="v-item"><b>Referrer</b>${escapeHtml(v.referrer) || 'direct'}</span>
        <span class="v-item v-page" title="${escapeHtml(v.page)}"><b>Page</b>${escapeHtml(v.page) || '—'}</span>
      </div>
    </div>
  `).join('');
}

// Typing only drives the native datalist suggestions (browser-built-in, always live).
// Filtering itself is explicit: click Search, or press Enter in any field.
[visitorIpFilter, visitorRegionFilter, visitorCityFilter, visitorPostalFilter].forEach(el=>{
  el.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); applyVisitorFilters(); }
  });
});
[visitorDateFrom, visitorDateTo, visitorDeviceFilter].forEach(el=>{
  el.addEventListener('change', applyVisitorFilters);
});

visitorFilterSearch.addEventListener('click', applyVisitorFilters);

visitorFilterReset.addEventListener('click', ()=>{
  visitorIpFilter.value = '';
  visitorRegionFilter.value = '';
  visitorCityFilter.value = '';
  visitorPostalFilter.value = '';
  visitorDateFrom.value = '';
  visitorDateTo.value = '';
  visitorDeviceFilter.value = '';
  applyVisitorFilters();
});

clearVisitorsBtn.addEventListener('click', async ()=>{
  if(!confirm('Delete all visitor logs permanently?')) return;
  clearVisitorsBtn.disabled = true;
  try{
    await withTimeout(remove(ref(dbVisitor, VISITORS_PATH)), 10000);
  }catch(err){
    console.error('Clear visitors error:', err);
    alert(friendlyError(err));
  }finally{
    clearVisitorsBtn.disabled = false;
  }
});

// ---------- failed login attempts ----------
function startLoginLogsListener(){
  if(loginLogsListenerAttached) return;
  loginLogsListenerAttached = true;

  loginLogsLoading.style.display = 'block';
  loginLogsLoading.classList.remove('is-error');
  loginLogsLoading.textContent = 'Loading…';

  const logsQuery = query(ref(dbVisitor, LOGIN_LOGS_PATH), orderByChild('createdAt'), limitToLast(300));
  onValue(logsQuery, (snapshot)=>{
    const val = snapshot.val() || {};
    const logs = Object.keys(val)
      .map(id => ({ id, ...val[id] }))
      .reverse();
    loginLogsLoading.style.display = 'none';
    renderLoginLogs(logs);
  }, (err)=>{
    console.error('Login logs listener error:', err);
    loginLogsLoading.style.display = 'block';
    loginLogsLoading.classList.add('is-error');
    loginLogsLoading.textContent = friendlyError(err) + ' (' + (err.code || 'unknown') + ')';
  });
}

function renderLoginLogs(logs){
  if(logs.length === 0){
    loginLogsTableWrap.style.display = 'none';
    loginLogsLoading.style.display = 'block';
    loginLogsLoading.classList.remove('is-error');
    loginLogsLoading.textContent = 'No failed login attempts.';
    return;
  }

  loginLogsLoading.style.display = 'none';
  loginLogsTableWrap.style.display = 'block';

  loginLogsTableBody.innerHTML = logs.map(l => `
    <tr>
      <td>${formatDate(l.createdAt)}</td>
      <td>${escapeHtml(l.ip) || '—'}</td>
      <td class="v-location-cell">${escapeHtml(locationLabel(l))}${locationPinIcon(l)}</td>
      <td>${escapeHtml(l.deviceType) || '—'}</td>
      <td>${escapeHtml([l.browser, l.os].filter(Boolean).join(' / ')) || '—'}</td>
      <td>${l.blocked ? '<span style="color:var(--ember);font-weight:600;">Blocked (1h)</span>' : 'Failed'}</td>
    </tr>
  `).join('');
}

clearLoginLogsBtn.addEventListener('click', async ()=>{
  if(!confirm('Delete all failed-login logs permanently?')) return;
  clearLoginLogsBtn.disabled = true;
  try{
    await withTimeout(remove(ref(dbVisitor, LOGIN_LOGS_PATH)), 10000);
  }catch(err){
    console.error('Clear login logs error:', err);
    alert(friendlyError(err));
  }finally{
    clearLoginLogsBtn.disabled = false;
  }
});
