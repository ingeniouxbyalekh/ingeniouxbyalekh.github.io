import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, remove, onValue, query, orderByChild
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

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

const ADMIN_PATH = 'adminConfig/passwordHash';
const MESSAGES_PATH = 'contactMessages';
const SESSION_KEY = 'ingenioux_admin_session';

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

let currentFilter = 'all';
let allMessages = [];
let messagesListenerAttached = false;

// ---------- auth flow ----------
function showDashboard(){
  loginScreen.style.display = 'none';
  dashboard.style.display = 'block';
  startMessagesListener();
}
function showLogin(){
  dashboard.style.display = 'none';
  loginScreen.style.display = 'flex';
}

if(sessionStorage.getItem(SESSION_KEY) === 'true'){
  showDashboard();
}

loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const pwd = document.getElementById('adminPassword').value;
  if(!pwd){ setStatus(loginStatus, 'Enter a password.', 'error'); return; }

  loginBtn.disabled = true;
  setStatus(loginStatus, 'Checking…', null);

  try{
    const snap = await withTimeout(get(ref(db, ADMIN_PATH)), 10000);
    const hash = await sha256(pwd);

    if(!snap.exists()){
      // first-time setup: whatever is entered becomes the admin password
      await withTimeout(set(ref(db, ADMIN_PATH), hash), 10000);
      setStatus(loginStatus, 'Admin password created. Logging in…', 'success');
    }else if(snap.val() !== hash){
      setStatus(loginStatus, 'Incorrect password.', 'error');
      loginBtn.disabled = false;
      return;
    }

    sessionStorage.setItem(SESSION_KEY, 'true');
    loginForm.reset();
    setStatus(loginStatus, '', null);
    showDashboard();
  }catch(err){
    console.error('Admin login error:', err);
    setStatus(loginStatus, friendlyError(err), 'error');
  }finally{
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', ()=>{
  sessionStorage.removeItem(SESSION_KEY);
  showLogin();
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
