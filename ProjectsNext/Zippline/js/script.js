import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, remove, push, onValue, onChildAdded, onChildChanged, onChildRemoved, query,
  orderByChild, equalTo, limitToLast, serverTimestamp, onDisconnect
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAb8dArGGAfGeoHlzSqD2crmDnnLBFD--Y",
  authDomain: "zippline-b2458.firebaseapp.com",
  databaseURL: "https://zippline-b2458-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "zippline-b2458",
  storageBucket: "zippline-b2458.firebasestorage.app",
  messagingSenderId: "178314842165",
  appId: "1:178314842165:web:3d99745cef0046235d217c"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);
const SESSION_KEY = "chatbox_session";

async function hash(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("chatbox::" + pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const COLORS = ["#2743e0", "#c2410c", "#0f766e", "#9333ea", "#be123c", "#4d7c0f", "#0369a1", "#a16207"];
function colorFor(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
function setAvatar(el, name, online) {
  el.style.background = colorFor(name);
  el.innerHTML = "";
  el.append(document.createTextNode(name.charAt(0).toUpperCase()));
  const dot = document.createElement("span");
  dot.className = "dot" + (online ? " on" : "");
  el.append(dot);
}

let me = null;
let users = {};          // id -> {username, isSpecial}  (merged: regular + special accounts)
let regularUsers = {};   // id -> {username}   — raw "users" table
let specialUsers = {};   // id -> {username}   — raw "special_user" table
let regularLoaded = false; // has the "users" listener delivered its first snapshot?
let specialLoaded = false; // has the "special_user" listener delivered its first snapshot?
let presence = {};       // id -> true
let lastSeen = {};       // id -> timestamp (ms) of when they last went offline
let lastMsg = {};        // contact id -> {key, text, mine, ts} latest message in that chat
let seenByMe = {};       // contact id -> timestamp when I last read that chat
let active = null;       // {id, username}
let unsubMessages = null;
let unsubs = [];
let mySessionToken = null;   // random id claiming this device as the active session for `me`

/* ---------------- Login ---------------- */
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("login-error");
  err.textContent = "";
  const username = $("l-user").value.trim().toLowerCase();
  const password = $("l-pass").value;
  if (!username || !password) return;
  $("login-btn").disabled = true;
  try {
    let found = null, isSpecial = false;
    const snap = await get(query(ref(db, "users"), orderByChild("username"), equalTo(username)));
    snap.forEach(c => { found = { id: c.key, ...c.val() }; });
    if (!found) {
      const specialSnap = await get(query(ref(db, "special_user"), orderByChild("username"), equalTo(username)));
      specialSnap.forEach(c => { found = { id: c.key, ...c.val() }; isSpecial = true; });
    }
    if (!found) throw new Error("Username or password is incorrect.");
    if (found.passHash !== await hash(password)) throw new Error("Username or password is incorrect.");
    const session = { id: found.id, username: found.username, isSpecial };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    $("l-pass").value = "";
    startApp(session);
  } catch (ex) {
    err.textContent = ex.message || "Could not sign in. Check your connection and try again.";
  } finally {
    $("login-btn").disabled = false;
  }
});

// Returns the presence-removal promise so callers can wait for the "offline" write.
function logout() {
  stopTyping();
  Object.values(watchers).forEach(u => u()); watchers = {};
  if (unsubMeta) { unsubMeta(); unsubMeta = null; }
  typingMap = {}; typingEl = null;
  if (inCall) hangUp();
  hideIncoming();
  const done = me
    ? Promise.all([
        set(ref(db, "presence/" + me.id), null),
        set(ref(db, "lastSeen/" + me.id), serverTimestamp())
      ]).catch(() => {})
    : Promise.resolve();
  localStorage.removeItem(SESSION_KEY);
  unsubs.forEach(u => u());
  unsubs = [];
  if (unsubMessages) unsubMessages();
  unsubMessages = null;
  me = null; active = null; users = {}; regularUsers = {}; specialUsers = {}; regularLoaded = false; specialLoaded = false; presence = {}; lastSeen = {}; lastMsg = {}; seenByMe = {};
  mySessionToken = null;
  $("app").classList.add("hidden");
  $("app").classList.remove("chat-open");
  $("login-view").classList.remove("hidden");
  return done;
}

// Logs this device out because another device just signed in as the same
// user, and shows why — used by the "sessions/{uid}" watcher in startApp().
function forceLogout(message) {
  logout();
  $("login-error").textContent = message;
}

// Sign out button: log out, then try to close the tab.
// Browsers only allow window.close() for tabs opened by script, so fall back to a message.
$("logout-btn").addEventListener("click", async () => {
  // wait for the offline write, but never more than 1.5s
  await Promise.race([logout(), new Promise(r => setTimeout(r, 1500))]);
  window.close();
  // If the browser blocked the close, the tab is still here:
  setTimeout(() => {
    if (!window.closed) toast("Signed out. You can close this tab.");
  }, 300);
});

// Claims this device as the one active session for `me`, and watches for
// another device claiming it later — one user can only be signed in on one
// device at a time, so a newer claim forces this device back to the login screen.
function watchSession() {
  mySessionToken = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2)));
  set(ref(db, "sessions/" + me.id), { token: mySessionToken, ts: serverTimestamp() }).catch(() => {});
  unsubs.push(onValue(ref(db, "sessions/" + me.id), (s) => {
    const v = s.val();
    if (v && v.token && v.token !== mySessionToken) {
      forceLogout("You were signed out because this account signed in on another device.");
    }
  }));
}

/* ---------------- App ---------------- */
function startApp(session) {
  me = session;
  $("login-view").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("me-name").textContent = me.username;
  showNoChat();
  listenIncoming();
  watchSession();

  // Typing indicators
  unsubs.push(onValue(ref(db, "typing"), (s) => {
    typingMap = s.val() || {};
    renderContacts();
    updateTypingUI();
  }));

  // Presence
  const myPresence = ref(db, "presence/" + me.id);
  unsubs.push(onValue(ref(db, ".info/connected"), (s) => {
    if (s.val() === true) {
      onDisconnect(myPresence).remove();
      onDisconnect(ref(db, "lastSeen/" + me.id)).set(serverTimestamp());
      set(myPresence, true);
    }
  }));
  unsubs.push(onValue(ref(db, "lastSeen"), (s) => {
    lastSeen = s.val() || {};
    updateHeadStatus();
  }));
  unsubs.push(onValue(ref(db, "presence"), (s) => {
    presence = s.val() || {};
    renderContacts();
    updateHeadStatus();
  }));

  // Users (also signs out if the account is deleted by admin).
  // Regular accounts ("users") and special-user accounts ("special_user") are
  // two Firebase tables merged into one working `users` dict so special users
  // show up as contacts and can chat exactly like regular users.
  // The two listeners load independently, so track when each has delivered
  // its first snapshot — the "account still exists" check for *this* session
  // must wait for its own table, or it can fire on a still-empty dict from
  // the other table and log a valid account straight back out.
  unsubs.push(onValue(ref(db, "users"), (s) => {
    regularUsers = {};
    s.forEach(c => { regularUsers[c.key] = { id: c.key, username: c.val().username, isSpecial: false }; });
    regularLoaded = true;
    onUsersChanged();
  }));
  unsubs.push(onValue(ref(db, "special_user"), (s) => {
    specialUsers = {};
    s.forEach(c => { specialUsers[c.key] = { id: c.key, username: c.val().username, isSpecial: true }; });
    specialLoaded = true;
    onUsersChanged();
  }));
}

function onUsersChanged() {
  if (!me) return;
  users = { ...regularUsers, ...specialUsers };
  const ownTableLoaded = me.isSpecial ? specialLoaded : regularLoaded;
  if (ownTableLoaded && !users[me.id]) {
    logout();
    $("login-error").textContent = "This account no longer exists.";
    return;
  }
  if (users[me.id]) {
    me.username = users[me.id].username;
    me.isSpecial = !!users[me.id].isSpecial;
    $("me-name").textContent = me.username;
  }
  if (active && !users[active.id]) { active = null; showNoChat(); }
  renderContacts();
  syncWatchers();
}

function renderContacts() {
  const box = $("contacts");
  box.innerHTML = "";
  const list = Object.values(users).filter(u => u.id !== me.id)
    .sort((a, b) => a.username.localeCompare(b.username));
  if (!list.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "No other users yet. Ask the admin to create another account.";
    box.append(d);
    return;
  }
  for (const u of list) {
    const online = !!presence[u.id];
    const b = document.createElement("button");
    b.className = "contact" + (active && active.id === u.id ? " active" : "");
    const av = document.createElement("div");
    av.className = "avatar";
    setAvatar(av, u.username, online);
    const info = document.createElement("div");
    const n = document.createElement("div"); n.className = "name"; n.textContent = u.username;
    const s = document.createElement("div"); s.className = "status"; const typing = isTyping(u.id);
    const lm = lastMsg[u.id];
    s.textContent = typing ? "typing…" : lm ? (lm.mine ? "You: " : "") + lm.text : "No messages yet";
    if (typing) s.classList.add("typing");
    else if (lm && !lm.mine && lm.ts > (seenByMe[u.id] || 0)) s.classList.add("received"); // unseen
    info.append(n, s);
    b.append(av, info);
    b.addEventListener("click", () => openChat(u));
    box.append(b);
  }
}

function chatIdFor(otherId) { return [me.id, otherId].sort().join("__"); }

/* ---------- Typing, delivered and seen ---------- */
let typingMap = {};
let typingOn = false, typingTimer = null, typingChatId = null, typingEl = null;
let deliveredAt = 0, seenAt = 0;
let unsubMeta = null;
let msgEls = {};      // message key -> {ts, mine, timeEl, tick}
let lastDay = "";
let watchers = {};    // contact id -> unsubscribe

/* ---------- Reply preview bar ---------- */
let replyTarget = null; // { id, text, fromName }

function showReplyBar() {
  if (!replyTarget) { $("reply-bar").classList.add("hidden"); return; }
  $("reply-bar-name").textContent = replyTarget.fromName;
  $("reply-bar-text").textContent = replyTarget.text;
  $("reply-bar").classList.remove("hidden");
}
function setReplyTarget(id, text, fromName) {
  replyTarget = { id, text: (text || "").slice(0, 300), fromName };
  showReplyBar();
  $("msg-input").focus();
}
function clearReplyTarget() {
  replyTarget = null;
  showReplyBar();
}
$("reply-bar-close").addEventListener("click", clearReplyTarget);

function scrollToMessage(id) {
  const rec = msgEls[id];
  if (!rec || !rec.el) return;
  rec.el.scrollIntoView({ behavior: "smooth", block: "center" });
  rec.el.classList.add("highlight");
  setTimeout(() => rec.el.classList.remove("highlight"), 1000);
}

/* ---------- Swipe-right to reply, long-press to edit ---------- */
function attachGestures(el, rec, key, chatId) {
  const SWIPE_THRESHOLD = 60, MAX_PULL = 70, LONG_PRESS_MS = 450;
  let startX = 0, startY = 0, dx = 0, dragging = false, moved = false, longPressTimer = null;
  const icon = el.querySelector(".swipe-icon");

  function onDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX = e.clientX; startY = e.clientY; dx = 0; dragging = true; moved = false;
    el.classList.add("swiping");
    if (rec.mine) {
      longPressTimer = setTimeout(() => {
        if (!moved) { dragging = false; el.classList.remove("swiping"); beginEdit(el, rec, key, chatId); }
      }, LONG_PRESS_MS);
    }
  }
  function onMove(e) {
    if (!dragging) return;
    const ddx = e.clientX - startX, ddy = e.clientY - startY;
    if (Math.abs(ddx) > 6 || Math.abs(ddy) > 6) { moved = true; clearTimeout(longPressTimer); }
    if (Math.abs(ddy) > Math.abs(ddx)) return;
    if (ddx <= 0) { dx = 0; el.style.transform = ""; if (icon) icon.style.opacity = 0; return; }
    dx = Math.min(ddx, MAX_PULL);
    el.style.transform = "translateX(" + dx + "px)";
    if (icon) icon.style.opacity = String(Math.min(dx / SWIPE_THRESHOLD, 1));
  }
  function onUp() {
    clearTimeout(longPressTimer);
    if (!dragging) return;
    dragging = false;
    el.classList.remove("swiping");
    el.style.transform = "";
    if (icon) icon.style.opacity = 0;
    if (dx >= SWIPE_THRESHOLD) setReplyTarget(key, rec.text, rec.mine ? "You" : rec.fromName);
  }
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("pointerleave", () => { if (dragging) onUp(); });
}

function beginEdit(el, rec, key, chatId) {
  if (!rec.mine || el.querySelector(".edit-wrap")) return;
  const txtEl = el.querySelector(".txt");
  const metaEl = el.querySelector(".meta");
  const wrap = document.createElement("div");
  wrap.className = "edit-wrap";
  const ta = document.createElement("textarea");
  ta.value = rec.text;
  ta.maxLength = 2000;
  ta.rows = Math.min(6, Math.max(1, Math.ceil(rec.text.length / 40)));
  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button"; cancelBtn.className = "cancel"; cancelBtn.textContent = "Cancel";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button"; saveBtn.className = "save"; saveBtn.textContent = "Save";
  actions.append(cancelBtn, saveBtn);
  wrap.append(ta, actions);
  txtEl.replaceWith(wrap);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  function finish(newTxt) {
    wrap.replaceWith(txtEl);
    if (newTxt !== null) {
      const clean = newTxt.trim().slice(0, 2000);
      if (clean && clean !== rec.text) {
        txtEl.textContent = clean;
        rec.text = clean;
        update(ref(db, "chats/" + chatId + "/messages/" + key), {
          text: clean, edited: true, editedTs: serverTimestamp()
        }).catch(() => toast("Could not save the edit."));
        if (metaEl && !metaEl.querySelector(".tag-edited")) {
          const tag = document.createElement("span");
          tag.className = "tag-edited"; tag.textContent = "edited";
          metaEl.insertBefore(tag, metaEl.firstChild);
        }
      }
    }
  }
  cancelBtn.addEventListener("click", () => finish(null));
  saveBtn.addEventListener("click", () => finish(ta.value));
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(ta.value); }
    else if (e.key === "Escape") { finish(null); }
  });
}

function isTyping(id) {
  const c = typingMap[chatIdFor(id)];
  return !!(c && c[id]);
}

function stopTyping() {
  clearTimeout(typingTimer); typingTimer = null;
  if (typingOn && typingChatId && me) {
    remove(ref(db, "typing/" + typingChatId + "/" + me.id)).catch(() => {});
  }
  typingOn = false; typingChatId = null;
}

$("msg-input").addEventListener("input", () => {
  if (!active || !me) return;
  if (!$("msg-input").value.trim()) { stopTyping(); return; }
  if (!typingOn) {
    typingOn = true;
    typingChatId = chatIdFor(active.id);
    const r = ref(db, "typing/" + typingChatId + "/" + me.id);
    set(r, true).catch(() => {});
    onDisconnect(r).remove();
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2500);
});

function updateTypingUI() {
  const box = $("messages");
  const t = !!(me && active && isTyping(active.id));
  if (t && !typingEl) {
    typingEl = document.createElement("div");
    typingEl.className = "msg typing";
    typingEl.setAttribute("aria-label", active.username + " is typing");
    typingEl.innerHTML = "<span></span><span></span><span></span>";
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.append(typingEl);
    if (near) box.scrollTop = box.scrollHeight;
  } else if (!t && typingEl) {
    typingEl.remove(); typingEl = null;
  }
  updateHeadStatus();
}

function tickState(ts) {
  return ts <= seenAt ? "seen" : ts <= deliveredAt ? "delivered" : "sent";
}
function paintTick(rec) {
  const s = tickState(rec.ts);
  rec.tick.className = "tick " + s;
  rec.tick.textContent = s === "seen" ? "✓✓ Seen" : s === "delivered" ? "✓✓ Delivered" : "✓ Sent";
}
function refreshTicks() {
  Object.values(msgEls).forEach(r => { if (r.mine) paintTick(r); });
}

function viewing() {
  return document.visibilityState === "visible" && document.hasFocus();
}

// Tell the sender that messages reached this device (and optionally that they were read)
function markReceipt(cid, seen) {
  if (!me) return;
  const base = "chats/" + cid + "/meta/";
  const ts = serverTimestamp();
  const upd = {};
  upd[base + "deliveredTo/" + me.id] = ts;
  if (seen) upd[base + "seenBy/" + me.id] = ts;
  update(ref(db), upd).catch(() => {});
}
function markSeenIfViewing() {
  if (me && active && viewing()) markReceipt(chatIdFor(active.id), true);
}
document.addEventListener("visibilitychange", markSeenIfViewing);
window.addEventListener("focus", markSeenIfViewing);

// Watch every conversation so messages count as "delivered" as soon as this user is online
function syncWatchers() {
  const want = new Set(Object.keys(users).filter(id => id !== me.id));
  for (const id of Object.keys(watchers)) {
    if (!want.has(id)) { watchers[id](); delete watchers[id]; }
  }
  for (const id of want) {
    if (watchers[id]) continue;
    const cid = chatIdFor(id);
    const lq = query(ref(db, "chats/" + cid + "/messages"), limitToLast(1));
    const setLast = (snap) => {
      const m = snap.val();
      if (!m) return;
      lastMsg[id] = { key: snap.key, text: m.text || "", mine: !!me && m.from === me.id, ts: m.ts || Date.now() };
      renderContacts();
    };
    const w1 = onChildAdded(lq, (snap) => {
      setLast(snap);
      const m = snap.val();
      if (!m || m.from === me.id) return;
      markReceipt(cid, !!(active && active.id === id && viewing()));
    });
    const w2 = onChildChanged(lq, (snap) => {
      if (lastMsg[id] && lastMsg[id].key === snap.key) setLast(snap);
    });
    const w3 = onChildRemoved(lq, (snap) => {
      if (lastMsg[id] && lastMsg[id].key === snap.key) { delete lastMsg[id]; renderContacts(); }
    });
    const w4 = onValue(ref(db, "chats/" + cid + "/meta/seenBy/" + me.id), (s) => {
      seenByMe[id] = s.val() || 0;
      renderContacts();
    });
    watchers[id] = () => { w1(); w2(); w3(); w4(); };
  }
}

function showNoChat() {
  stopTyping();
  clearReplyTarget();
  $("no-chat").style.display = "";
  $("chat-pane").style.display = "none";
  $("app").classList.remove("chat-open");
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  if (unsubMeta) { unsubMeta(); unsubMeta = null; }
  typingEl = null;
  active = null;
  if (me) renderContacts();
}

function updateHeadStatus() {
  if (!active) return;
  const online = !!presence[active.id];
  const typing = isTyping(active.id);
  const st = $("ch-status");
  st.textContent = typing ? "typing…" : online ? "Online" : lastSeenText(lastSeen[active.id]);
  st.classList.toggle("typing", typing);
  setAvatar($("ch-avatar"), active.username, online);
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDay(ts) {
  const d = new Date(ts), t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

// "Today at 4:29 PM" / "Yesterday at …" / "12 Sep 2026 at …"
function lastSeenText(ts) {
  if (!ts || typeof ts !== "number") return "Offline";
  const day = fmtDay(ts);
  return day + " at " + fmtTime(ts);
}

function openChat(user) {
  stopTyping();
  clearReplyTarget();
  if (unsubMessages) unsubMessages();
  if (unsubMeta) unsubMeta();
  active = user;
  $("msg-input").value = "";
  $("no-chat").style.display = "none";
  $("chat-pane").style.display = "flex";
  $("app").classList.add("chat-open");
  $("ch-name").textContent = user.username;
  updateHeadStatus();
  renderContacts();

  const box = $("messages");
  box.innerHTML = "";
  typingEl = null;
  msgEls = {};
  deliveredAt = 0; seenAt = 0;
  lastDay = "";
  const chatId = chatIdFor(user.id);

  // Delivered / seen pointers written by the other person
  unsubMeta = onValue(ref(db, "chats/" + chatId + "/meta"), (s) => {
    const v = s.val() || {};
    deliveredAt = (v.deliveredTo && v.deliveredTo[user.id]) || 0;
    seenAt = (v.seenBy && v.seenBy[user.id]) || 0;
    refreshTicks();
  });

  const q = query(ref(db, "chats/" + chatId + "/messages"), limitToLast(300));
  const u1 = onChildAdded(q, (snap) => {
    const m = snap.val();
    const key = snap.key;
    const ts = m.ts || Date.now();
    const mine = m.from === me.id;
    const fromName = mine ? me.username : active.username;
    const day = fmtDay(ts);
    if (day !== lastDay) {
      lastDay = day;
      const d = document.createElement("div");
      d.className = "day"; d.textContent = day;
      box.insertBefore(d, typingEl);
    }

    // Call log entry (completed / missed) — tap to call again
    if (m.kind === "call") {
      const declined = m.status === "declined";
      const missed = m.status === "missed" || declined;
      const type = m.callType === "audio" ? "audio" : "video";
      const cl = document.createElement("div");
      cl.className = "msg calllog" + (mine ? " mine" : "");
      cl.setAttribute("role", "button");
      cl.tabIndex = 0;
      cl.setAttribute("aria-label", (m.text || "Call") + ". Tap to call again.");
      const ico = document.createElement("span");
      ico.className = "cl-ico" + (missed ? " missed" : "");
      ico.innerHTML = callIconSvg(type);
      const body = document.createElement("div");
      body.className = "cl-body";
      const title = document.createElement("div");
      title.className = "cl-title" + (missed ? " missed" : "");
      title.textContent = declined ? "Declined " + type + " call" : missed ? "Missed " + type + " call" : (type === "audio" ? "Audio" : "Video") + " call";
      const sub = document.createElement("div");
      sub.className = "cl-sub";
      const time = document.createElement("time");
      time.textContent = fmtTime(ts);
      sub.append(document.createTextNode(!missed && m.duration ? "Duration " + fmtDuration(m.duration) + " · " : ""), time);
      body.append(title, sub);
      cl.append(ico, body);
      const redial = () => startCall(type);
      cl.addEventListener("click", redial);
      cl.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); redial(); }
      });
      // mine:false keeps call entries out of the ticks/edit logic
      msgEls[key] = { ts, mine: false, timeEl: time, tick: null, text: m.text || "", el: cl, fromName };
      box.insertBefore(cl, typingEl);
      box.scrollTop = box.scrollHeight;
      return;
    }

    const el = document.createElement("div");
    el.className = "msg" + (mine ? " mine" : "");

    const swipeIcon = document.createElement("span");
    swipeIcon.className = "swipe-icon";
    swipeIcon.textContent = "↩";
    swipeIcon.setAttribute("aria-hidden", "true");
    el.append(swipeIcon);

    if (m.replyTo) {
      const quote = document.createElement("div");
      quote.className = "quote";
      const qn = document.createElement("span"); qn.className = "qname"; qn.textContent = m.replyTo.fromName;
      const qt = document.createElement("span"); qt.className = "qtext"; qt.textContent = m.replyTo.text;
      quote.append(qn, qt);
      quote.addEventListener("click", () => scrollToMessage(m.replyTo.id));
      el.append(quote);
    }

    const txt = document.createElement("span");
    txt.className = "txt"; txt.textContent = m.text;
    const meta = document.createElement("div");
    meta.className = "meta";
    const time = document.createElement("time");
    time.textContent = fmtTime(ts);
    meta.append(time);
    if (m.edited) {
      const tag = document.createElement("span");
      tag.className = "tag-edited"; tag.textContent = "edited";
      meta.append(tag);
    }
    const rec = { ts, mine, timeEl: time, tick: null, text: m.text, el, fromName };
    if (mine) {
      rec.tick = document.createElement("span");
      meta.append(rec.tick);
      paintTick(rec);
    }
    el.append(txt, meta);
    msgEls[key] = rec;
    attachGestures(el, rec, key, chatId);
    box.insertBefore(el, typingEl);
    box.scrollTop = box.scrollHeight;
  });
  // The server replaces the local timestamp estimate with the real one, and reflects edits made from either device
  const u2 = onChildChanged(q, (snap) => {
    const rec = msgEls[snap.key], m = snap.val();
    if (!rec) return;
    if (m.ts && m.ts !== rec.ts) {
      rec.ts = m.ts;
      rec.timeEl.textContent = fmtTime(m.ts);
      if (rec.mine) paintTick(rec);
    }
    if (typeof m.text === "string" && m.text !== rec.text) {
      rec.text = m.text;
      const txtEl = rec.el.querySelector(".txt");
      if (txtEl && !rec.el.querySelector(".edit-wrap")) txtEl.textContent = m.text;
    }
    if (m.edited) {
      const metaEl = rec.el.querySelector(".meta");
      if (metaEl && !metaEl.querySelector(".tag-edited")) {
        const tag = document.createElement("span");
        tag.className = "tag-edited"; tag.textContent = "edited";
        metaEl.insertBefore(tag, metaEl.firstChild);
      }
    }
  });
  // Reflects messages deleted from either device (e.g. Clear chat) instantly.
  const u3 = onChildRemoved(q, (snap) => {
    const rec = msgEls[snap.key];
    if (rec) { rec.el.remove(); delete msgEls[snap.key]; }
    if (Object.keys(msgEls).length === 0) {
      box.innerHTML = "";
      typingEl = null;
      lastDay = "";
      updateTypingUI();
    }
  });
  unsubMessages = () => { u1(); u2(); u3(); };

  markReceipt(chatId, viewing());
  updateTypingUI();
}

$("back-btn").addEventListener("click", showNoChat);

$("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("msg-input");
  const text = input.value.trim();
  if (!text || !active) return;
  input.value = "";
  stopTyping();
  const chatId = chatIdFor(active.id);
  const payload = {
    from: me.id,
    text: text.slice(0, 2000),
    ts: serverTimestamp()
  };
  const pendingReply = replyTarget;
  if (pendingReply) payload.replyTo = { id: pendingReply.id, text: pendingReply.text, fromName: pendingReply.fromName };
  clearReplyTarget();
  try {
    await push(ref(db, "chats/" + chatId + "/messages"), payload);
  } catch (ex) {
    input.value = text;
    if (pendingReply) setReplyTarget(pendingReply.id, pendingReply.text, pendingReply.fromName);
    alert("Message not sent. Check your connection and try again.");
  }
});

/* ---------------- Video call (WebRTC, signaling via Realtime Database) ---------------- */
const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
    // Strict firewalls / mobile networks may need a TURN relay. Add yours here:
    // , { urls: "turn:your.turn.server:3478", username: "USER", credential: "PASS" }
  ]
};

let pc = null, localStream = null;
let inCall = false, callId = null, callRole = null, callPeer = null, callType = "video";
let callUnsubs = [], callDisc = [], pendingCands = [], answerApplied = false;
let ringTimer = null, timerInt = null, ringCtx = null, ringInt = null;
let callTextHideTimer = null;
// Volume cycle for the remote audio: 100% → 150% → 200% → 0% → 100% …
const VOLUME_STEPS = [1, 1.5, 2, 0];
let volIndex = 0;                       // resets to 100% at the start of every call
let audioCtx = null, gainNode = null, volSource = null;
let currentFacing = "user"; // "user" (front) or "environment" (back) — for the flip-camera button
let cachedPrimaryBackCameraId = null; // resolved once per session, then reused on later flips
let incoming = null;
let callConnectedAt = null; // set once when a call actually connects (for duration)
let callEndReason = null;   // set to "declined" when the callee declines

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}
function callIconSvg(type) {
  return type === "audio"
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l7-4v12l-7-4z"/></svg>';
}
// Writes a call entry into the chat with `peerId` (status: "completed" | "missed").
function logCall(peerId, type, status, seconds) {
  if (!me || !peerId) return;
  const t = type === "audio" ? "audio" : "video";
  const text = status === "missed"
    ? "Missed " + t + " call"
    : status === "declined"
      ? "Declined " + t + " call"
      : (t === "audio" ? "Audio" : "Video") + " call · " + fmtDuration(seconds);
  push(ref(db, "chats/" + chatIdFor(peerId) + "/messages"), {
    from: me.id, kind: "call", callType: t, status,
    duration: status === "completed" ? (seconds || 0) : 0,
    text, ts: serverTimestamp()
  }).catch(() => {});
}

function setCallStatus(t) { $("call-status").textContent = t; }

function showCallUI(status) {
  $("call-name").textContent = callPeer.username;
  setCallStatus(status);
  volIndex = 0;
  applyVolume();
  $("call").classList.remove("swapped");
  $("mic-btn").classList.remove("off");
  $("cam-btn").classList.remove("off");
  currentFacing = "user";
  $("call").classList.remove("facing-environment");
  $("flip-btn").classList.add("hidden");
  $("call").classList.toggle("audio-only", callType === "audio");
  $("call").classList.toggle("capture-enabled", !!(me && me.isSpecial) && callType === "video");
  if (callType === "audio") {
    const av = $("call-avatar");
    av.style.background = colorFor(callPeer.username);
    av.textContent = callPeer.username.charAt(0).toUpperCase();
  }
  $("call").classList.remove("hidden");
  clearTimeout(callTextHideTimer);
  $("call-text-bubble").classList.add("hidden");
  $("call-text-input").value = "";
}

// In-call live text: one ephemeral message at a time, stored at
// calls/{callId}/liveText (overwritten with `set`, not appended with
// `push`), so only the most recent message ever exists. It's wiped in
// teardown() below, so nothing survives past the end of the call.
function listenCallText() {
  callUnsubs.push(onValue(ref(db, "calls/" + callId + "/liveText"), (snap) => {
    const v = snap.val();
    clearTimeout(callTextHideTimer);
    const bubble = $("call-text-bubble");
    if (!v || !v.text) { bubble.classList.add("hidden"); return; }
    const mine = v.from === me.id;
    $("call-text-who").textContent = mine ? "You" : (v.fromName || (callPeer && callPeer.username) || "");
    $("call-text-txt").textContent = v.text;
    bubble.classList.toggle("mine", mine);
    bubble.classList.remove("hidden");
    callTextHideTimer = setTimeout(() => bubble.classList.add("hidden"), 6000);
  }));
}

$("call-text-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("call-text-input");
  const text = input.value.trim();
  if (!text || !callId) return;
  input.value = "";
  set(ref(db, "calls/" + callId + "/liveText"), {
    from: me.id, fromName: me.username, text: text, ts: serverTimestamp()
  }).catch(() => {});
});

// Show the flip-camera button only when more than one camera is available
// (front + back, typically on phones) and this is a video call.
async function updateFlipAvailability() {
  if (callType !== "video" || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");
    $("flip-btn").classList.toggle("hidden", cams.length < 2);
  } catch (e) { /* leave it hidden if we can't tell */ }
}

// On phones with multiple rear lenses (main + ultra-wide + telephoto),
// asking for facingMode:"environment" alone can hand back the ultra-wide
// lens instead of the primary camera — device labels aren't reliable
// enough to tell them apart by name alone. Instead, briefly probe each
// back-facing camera's reported max resolution and pick the one with the
// most pixels: on phones the primary sensor is almost always the
// highest-resolution one, while ultra-wide/telephoto sensors are lower-res.
// The result is cached so we only probe once per call.
async function pickPrimaryBackCameraId() {
  if (cachedPrimaryBackCameraId) return cachedPrimaryBackCameraId;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");
    let candidates = cams.filter(d => /back|rear|environment/i.test(d.label));
    if (!candidates.length) candidates = cams.filter(d => !/front|user|face/i.test(d.label));
    if (!candidates.length) candidates = cams;
    if (!candidates.length) return null;
    if (candidates.length === 1) {
      cachedPrimaryBackCameraId = candidates[0].deviceId;
      return cachedPrimaryBackCameraId;
    }

    let bestId = null, bestPixels = -1;
    for (const cam of candidates) {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: cam.deviceId } },
          audio: false
        });
        const track = probe.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        const pixels = (caps.width && caps.width.max ? caps.width.max : 0) *
                       (caps.height && caps.height.max ? caps.height.max : 0);
        track.stop();
        if (pixels > bestPixels) { bestPixels = pixels; bestId = cam.deviceId; }
      } catch (e) { /* this lens couldn't be opened for probing — skip it */ }
    }
    cachedPrimaryBackCameraId = bestId || candidates[0].deviceId;
    return cachedPrimaryBackCameraId;
  } catch (e) { /* fall back to facingMode below */ }
  return null;
}

async function getMedia(withVideo) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Calls need a secure page (https or localhost).");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      // Keep the camera's 4:3 shape, just ask for a sharper capture at that ratio.
      video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 4 / 3 } } : false,
      audio: true
    });
  } catch (e) {
    throw new Error(withVideo
      ? "Could not use the camera and microphone. Allow access in your browser and try again."
      : "Could not use the microphone. Allow access in your browser and try again.");
  }
}

// Volume control: uses a Web Audio GainNode so the level can go above 100%.
// The <video> element itself is muted while the gain node is active, so the
// audio is only heard once (through the gain node).
function applyVolume() {
  const v = VOLUME_STEPS[volIndex];
  const rv = $("remote-video");
  if (gainNode) {
    gainNode.gain.value = v;
    rv.muted = true;
  } else {
    // Fallback if Web Audio isn't available: plain element volume (max 100%)
    rv.muted = false;
    rv.volume = Math.min(1, v);
  }
  const pct = Math.round(v * 100) + "%";
  $("volume-btn-label").textContent = pct;
  $("volume-btn").setAttribute("aria-label", "Volume " + pct + ". Tap to change");
}
function setupVolume(stream) {
  teardownVolume();
  if (!stream || !stream.getAudioTracks().length) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    volSource = audioCtx.createMediaStreamSource(stream);
    gainNode = audioCtx.createGain();
    volSource.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  } catch (e) {
    audioCtx = null; gainNode = null; volSource = null;
  }
  applyVolume();
}
function teardownVolume() {
  try { if (volSource) volSource.disconnect(); } catch (e) {}
  try { if (gainNode) gainNode.disconnect(); } catch (e) {}
  if (audioCtx) audioCtx.close().catch(() => {});
  audioCtx = null; gainNode = null; volSource = null;
  $("remote-video").muted = false;
}

function createPeer(myCandidatesPath) {
  const conn = new RTCPeerConnection(ICE);
  pc = conn;
  localStream.getTracks().forEach(t => conn.addTrack(t, localStream));
  conn.ontrack = (e) => {
    const stream = e.streams[0];
    $("remote-video").srcObject = stream;
    if (e.track.kind === "audio") setupVolume(stream);
  };
  conn.onicecandidate = (e) => {
    if (e.candidate) push(ref(db, myCandidatesPath), e.candidate.toJSON()).catch(() => {});
  };
  conn.onconnectionstatechange = () => {
    if (pc !== conn) return;
    const s = conn.connectionState;
    if (s === "connected") {
      clearTimeout(ringTimer);
      if (!callConnectedAt) callConnectedAt = Date.now();
      const start = Date.now();
      clearInterval(timerInt);
      timerInt = setInterval(() => {
        const sec = Math.floor((Date.now() - start) / 1000);
        setCallStatus(String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0"));
      }, 1000);
      setCallStatus("00:00");
    } else if (s === "disconnected") {
      clearInterval(timerInt);
      setCallStatus("Reconnecting…");
    } else if (s === "failed") {
      hangUp();
      toast("The connection failed. A TURN server may be needed on this network.");
    }
  };
}

function addRemoteCandidate(c) {
  if (pc && pc.remoteDescription) pc.addIceCandidate(c).catch(() => {});
  else pendingCands.push(c);
}
function flushCandidates() {
  if (!pc) return;
  pendingCands.splice(0).forEach(c => pc.addIceCandidate(c).catch(() => {}));
}

function teardown(msg) {
  const id = callId, role = callRole, peer = callPeer;
  const connectedAt = callConnectedAt, typeAtEnd = callType;
  const endReason = callEndReason;
  callConnectedAt = null; callEndReason = null;
  clearTimeout(ringTimer); clearInterval(timerInt); stopRing();
  clearTimeout(callTextHideTimer);
  $("snap-target").style.display = "none";
  $("call-text-bubble").classList.add("hidden");
  $("call-text-input").value = "";
  if (id) remove(ref(db, "calls/" + id + "/liveText")).catch(() => {});
  callUnsubs.forEach(u => u()); callUnsubs = [];
  callDisc.forEach(d => d.cancel().catch(() => {})); callDisc = [];
  if (pc) {
    pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null;
    pc.close(); pc = null;
  }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  $("remote-video").srcObject = null;
  teardownVolume();
  $("local-video").srcObject = null;
  $("call").classList.add("hidden");
  $("call").classList.remove("audio-only");
  $("call").classList.remove("facing-environment");
  $("call").classList.remove("swapped");
  $("flip-btn").classList.add("hidden");
  currentFacing = "user";
  pendingCands = []; answerApplied = false;
  inCall = false; callId = null; callRole = null; callPeer = null;

  if (id && role === "caller") {
    // Only the caller writes the chat entry, so it is never duplicated
    if (connectedAt) logCall(peer.id, typeAtEnd, "completed", (Date.now() - connectedAt) / 1000);
    else logCall(peer.id, typeAtEnd, endReason === "declined" ? "declined" : "missed", 0);
    // Clean up signaling data
    get(ref(db, "incoming/" + peer.id)).then(s => {
      if (s.exists() && s.val().callId === id) remove(ref(db, "incoming/" + peer.id));
    }).catch(() => {});
    setTimeout(() => remove(ref(db, "calls/" + id)).catch(() => {}), 3000);
  }
  if (msg) toast(msg);
}

function hangUp() {
  if (callId) update(ref(db, "calls/" + callId), { state: "ended" }).catch(() => {});
  teardown();
}

/* ----- Caller ----- */
async function startCall(type) {
  if (!active || inCall || incoming) return;
  if (!presence[active.id]) {
    toast(active.username + " is offline. They need to be signed in to get a call.");
    logCall(active.id, type, "missed", 0);
    return;
  }
  inCall = true;
  callPeer = active;
  callRole = "caller";
  callType = type;
  showCallUI(type === "video" ? "Starting camera…" : "Calling…");
  try {
    localStream = await getMedia(type === "video");
    if (!inCall) { localStream.getTracks().forEach(t => t.stop()); localStream = null; return; }
    if (type === "video") { $("local-video").srcObject = localStream; updateFlipAvailability(); }

    const callRef = push(ref(db, "calls"));
    callId = callRef.key;
    listenCallText();
    createPeer("calls/" + callId + "/callerCandidates");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!inCall) return;

    await set(callRef, {
      caller: me.id, callerName: me.username, callee: callPeer.id,
      type,
      offer: { type: offer.type, sdp: offer.sdp },
      state: "ringing", ts: serverTimestamp()
    });
    const incRef = ref(db, "incoming/" + callPeer.id);
    await set(incRef, { callId, from: me.id, fromName: me.username, type, ts: serverTimestamp() });
    const d1 = onDisconnect(incRef); d1.remove();
    const d2 = onDisconnect(ref(db, "calls/" + callId + "/state")); d2.set("ended");
    callDisc.push(d1, d2);
    if (!inCall) return;

    const peerName = callPeer.username;
    setCallStatus("Calling " + peerName + "…");
    ringTimer = setTimeout(() => {
      if (inCall && (!pc || pc.connectionState !== "connected")) { hangUp(); toast("No answer from " + peerName + "."); }
    }, 45000);

    callUnsubs.push(onValue(callRef, (snap) => {
      const c = snap.val();
      if (!c) { teardown("Call ended"); return; }
      if (c.state === "declined") { callEndReason = "declined"; teardown(peerName + " declined the call."); return; }
      if (c.state === "busy") { teardown(peerName + " is on another call."); return; }
      if (c.state === "ended") { teardown("Call ended"); return; }
      if (c.answer && !answerApplied && pc) {
        answerApplied = true;
        setCallStatus("Connecting…");
        pc.setRemoteDescription(c.answer).then(flushCandidates).catch(() => {});
      }
    }));
    callUnsubs.push(onChildAdded(ref(db, "calls/" + callId + "/calleeCandidates"), (s) => addRemoteCandidate(s.val())));
  } catch (e) {
    teardown(e.message || "Could not start the call.");
  }
}

/* ----- Callee ----- */
function startRing() {
  try {
    ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      const o = ringCtx.createOscillator(), g = ringCtx.createGain();
      o.frequency.value = 440; g.gain.value = 0.08;
      o.connect(g); g.connect(ringCtx.destination);
      o.start(); o.stop(ringCtx.currentTime + 0.4);
    };
    beep();
    ringInt = setInterval(beep, 1500);
  } catch (e) { /* sound is optional */ }
}
function stopRing() {
  clearInterval(ringInt); ringInt = null;
  if (ringCtx) { ringCtx.close().catch(() => {}); ringCtx = null; }
}

function showIncoming(inc) {
  incoming = inc;
  $("in-name").textContent = inc.fromName;
  $("in-sub").textContent = inc.type === "audio" ? "Voice call" : "Video call";
  setAvatar($("in-avatar"), inc.fromName, true);
  $("incoming").classList.remove("hidden");
  startRing();
}
function hideIncoming() {
  incoming = null;
  stopRing();
  $("incoming").classList.add("hidden");
}

function listenIncoming() {
  unsubs.push(onValue(ref(db, "incoming/" + me.id), async (snap) => {
    const inc = snap.val();
    if (!inc) { if (incoming && !inCall) hideIncoming(); return; }
    if (incoming && incoming.callId === inc.callId) return;
    if (inCall || incoming) {
      update(ref(db, "calls/" + inc.callId), { state: "busy" }).catch(() => {});
      remove(ref(db, "incoming/" + me.id)).catch(() => {});
      return;
    }
    try {
      const c = (await get(ref(db, "calls/" + inc.callId))).val();
      const stale = inc.ts && Date.now() - inc.ts > 60000;
      if (!c || c.state !== "ringing" || stale) { remove(ref(db, "incoming/" + me.id)).catch(() => {}); return; }
      if (!inCall && !incoming) showIncoming(inc);
    } catch (e) { /* ignore */ }
  }));
}

async function acceptCall() {
  const inc = incoming;
  if (!inc || inCall) return;
  hideIncoming();
  inCall = true;
  callId = inc.callId;
  listenCallText();
  callRole = "callee";
  callPeer = { id: inc.from, username: inc.fromName };
  callType = inc.type || "video";
  showCallUI("Connecting…");
  try {
    const c = (await get(ref(db, "calls/" + callId))).val();
    if (!c || c.state !== "ringing") throw new Error("The caller hung up.");
    callType = c.type || callType;
    localStream = await getMedia(callType === "video");
    if (!inCall) { localStream.getTracks().forEach(t => t.stop()); localStream = null; return; }
    if (callType === "video") { $("local-video").srcObject = localStream; updateFlipAvailability(); }

    createPeer("calls/" + callId + "/calleeCandidates");
    await pc.setRemoteDescription(c.offer);
    flushCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const callRef = ref(db, "calls/" + callId);
    await update(callRef, { answer: { type: answer.type, sdp: answer.sdp }, state: "active" });
    remove(ref(db, "incoming/" + me.id)).catch(() => {});
    const d = onDisconnect(ref(db, "calls/" + callId + "/state")); d.set("ended");
    callDisc.push(d);

    const peerName = callPeer.username;
    callUnsubs.push(onValue(callRef, (snap) => {
      const v = snap.val();
      if (!v || v.state === "ended") teardown("Call ended");
    }));
    callUnsubs.push(onChildAdded(ref(db, "calls/" + callId + "/callerCandidates"), (s) => addRemoteCandidate(s.val())));
  } catch (e) {
    const id = callId;
    if (id) update(ref(db, "calls/" + id), { state: "ended" }).catch(() => {});
    remove(ref(db, "incoming/" + me.id)).catch(() => {});
    teardown(e.message || "Could not join the call.");
  }
}

function declineCall() {
  const inc = incoming;
  if (!inc) return;
  hideIncoming();
  update(ref(db, "calls/" + inc.callId), { state: "declined" }).catch(() => {});
  remove(ref(db, "incoming/" + me.id)).catch(() => {});
}

/* ----- Clear chat ----- */
$("clear-chat-btn").addEventListener("click", () => {
  if (!active) return;
  $("clear-chat-modal").classList.remove("hidden");
});
$("clear-chat-cancel").addEventListener("click", () => {
  $("clear-chat-modal").classList.add("hidden");
});
$("clear-chat-ok").addEventListener("click", async () => {
  $("clear-chat-modal").classList.add("hidden");
  if (!active) return;
  const clearedUser = active;
  // Clear the screen instantly for this device instead of waiting on the round-trip.
  const box = $("messages");
  box.innerHTML = "";
  typingEl = null;
  msgEls = {};
  lastDay = "";
  try {
    await remove(ref(db, "chats/" + chatIdFor(clearedUser.id) + "/messages"));
  } catch (ex) {
    // Deletion failed server-side: resync the view from what's actually in the database.
    if (active && active.id === clearedUser.id) openChat(active);
    alert("Couldn't clear chat. Check your connection and try again.");
  }
});

/* ----- Call controls ----- */
$("audio-call-btn").addEventListener("click", () => startCall("audio"));
$("call-btn").addEventListener("click", () => startCall("video"));
$("end-btn").addEventListener("click", hangUp);
$("accept-btn").addEventListener("click", acceptCall);
$("decline-btn").addEventListener("click", declineCall);
$("volume-btn").addEventListener("click", () => {
  volIndex = (volIndex + 1) % VOLUME_STEPS.length;
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  applyVolume();
});

// Special-user only: clicking the peer's live video feed during a video
// call (not audio) instantly saves that frame as a PNG named YYMMDDHHMMSS.png.
function pad(n, len) { return String(n).padStart(len, "0"); }
function frameFilename() {
  const d = new Date();
  return pad(d.getFullYear() % 100, 2) + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2) +
         pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2) + ".png";
}
function captureRemoteFrame() {
  if (!me || !me.isSpecial) return;
  if (!inCall || callType !== "video") return;
  const video = largeVideo();
  if (!video.videoWidth || !video.videoHeight) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = frameFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
  const flash = $("snap-flash");
  flash.classList.remove("go");
  void flash.offsetWidth; // restart animation
  flash.classList.add("go");
}
// The <video> element fills its whole tile, but with object-fit:contain the
// actual picture is letterboxed/pillarboxed inside it. Rather than hit-testing
// every click against that math, size a real overlay element to match just
// the visible picture, and only that overlay is clickable/hoverable — so the
// bars around it (and the local-preview corner, which sits above it) never
// trigger a capture.
// Whichever feed currently fills the stage (mine when swapped, theirs otherwise).
function largeVideo() {
  return $("call").classList.contains("swapped") ? $("local-video") : $("remote-video");
}
function toggleSwap() {
  if (!inCall || callType !== "video") return;
  $("call").classList.toggle("swapped");
  positionSnapTarget();
  requestAnimationFrame(positionSnapTarget);
}
function positionSnapTarget() {
  const video = largeVideo(), stage = video.parentElement, target = $("snap-target");
  if (!video.videoWidth || !video.videoHeight) { target.style.display = "none"; return; }
  const vRect = video.getBoundingClientRect(), sRect = stage.getBoundingClientRect();
  const scale = Math.min(vRect.width / video.videoWidth, vRect.height / video.videoHeight);
  const w = video.videoWidth * scale, h = video.videoHeight * scale;
  target.style.left = (vRect.left - sRect.left + (vRect.width - w) / 2) + "px";
  target.style.top = (vRect.top - sRect.top + (vRect.height - h) / 2) + "px";
  target.style.width = w + "px";
  target.style.height = h + "px";
  target.style.display = "block";
}
{
  const rv = $("remote-video"), lv = $("local-video");
  [rv, lv].forEach(v => {
    v.addEventListener("loadedmetadata", positionSnapTarget);
    v.addEventListener("resize", positionSnapTarget);
    if (window.ResizeObserver) new ResizeObserver(positionSnapTarget).observe(v);
  });
  window.addEventListener("resize", positionSnapTarget);
  // Tap the small tile (whichever one it is) to make it large; tap it again to swap back.
  lv.addEventListener("click", () => { if (!$("call").classList.contains("swapped")) toggleSwap(); });
  rv.addEventListener("click", () => { if ($("call").classList.contains("swapped")) toggleSwap(); });
}
$("snap-target").addEventListener("click", captureRemoteFrame);

$("mic-btn").addEventListener("click", () => {
  if (!localStream) return;
  const tracks = localStream.getAudioTracks();
  const on = !tracks.every(t => t.enabled);
  tracks.forEach(t => t.enabled = on);
  $("mic-btn").classList.toggle("off", !on);
  $("mic-btn").setAttribute("aria-label", on ? "Mute microphone" : "Unmute microphone");
});
$("cam-btn").addEventListener("click", () => {
  if (!localStream) return;
  const tracks = localStream.getVideoTracks();
  const on = !tracks.every(t => t.enabled);
  tracks.forEach(t => t.enabled = on);
  $("cam-btn").classList.toggle("off", !on);
  $("cam-btn").setAttribute("aria-label", on ? "Turn camera off" : "Turn camera on");
});
let flipping = false;
$("flip-btn").addEventListener("click", async () => {
  if (!localStream || !pc || flipping) return;
  const oldTrack = localStream.getVideoTracks()[0];
  if (!oldTrack) return;
  flipping = true;
  $("flip-btn").disabled = true;
  const previousFacing = currentFacing;
  const wantFacing = currentFacing === "user" ? "environment" : "user";
  const wasEnabled = oldTrack.enabled;
  const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");

  // Release the current camera before asking for the other one — most phones
  // only let one capture session use the camera hardware at a time, so
  // requesting the new facing mode while the old track is still live fails
  // on many devices. This briefly freezes the local preview, which is expected.
  localStream.removeTrack(oldTrack);
  oldTrack.stop();

  async function swapIn(facing) {
    const baseVideo = { width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 4 / 3 } };
    let newStream;
    if (facing === "environment") {
      // Try to target the main rear camera by deviceId first (avoids
      // landing on an ultra-wide lens); fall back to plain facingMode
      // if we can't identify it or that device fails.
      const backId = await pickPrimaryBackCameraId();
      try {
        if (backId) {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { ...baseVideo, deviceId: { exact: backId } },
            audio: false
          });
        } else {
          throw new Error("no-primary-back-camera-id");
        }
      } catch (e) {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { ...baseVideo, facingMode: { ideal: facing } },
          audio: false
        });
      }
    } else {
      newStream = await navigator.mediaDevices.getUserMedia({
        video: { ...baseVideo, facingMode: { ideal: facing } },
        audio: false
      });
    }
    const newTrack = newStream.getVideoTracks()[0];
    newTrack.enabled = wasEnabled;
    if (sender) await sender.replaceTrack(newTrack);
    localStream.addTrack(newTrack);
    $("local-video").srcObject = localStream;
    return facing;
  }

  try {
    currentFacing = await swapIn(wantFacing);
    $("call").classList.toggle("facing-environment", currentFacing === "environment");
  } catch (e) {
    // Switch failed — try to get the original camera back rather than
    // leaving the call with no outgoing video at all.
    try {
      currentFacing = await swapIn(previousFacing);
      $("call").classList.toggle("facing-environment", currentFacing === "environment");
      toast("Could not switch cameras.");
    } catch (e2) {
      toast("Could not switch cameras. Camera access was lost — you may need to rejoin the call.");
    }
  } finally {
    flipping = false;
    $("flip-btn").disabled = false;
  }
});

/* ---------- Keep the header visible when the mobile keyboard opens ---------- */
function fitToViewport() {
  const vv = window.visualViewport;
  const appEl = $("app");
  if (!vv) return;
  appEl.style.height = vv.height + "px";
  appEl.style.top = vv.offsetTop + "px";
  // undo the browser's own "scroll the page to show the input" jump
  if (window.scrollY !== 0) window.scrollTo(0, 0);
  const box = $("messages");
  if (box && document.activeElement === $("msg-input")) box.scrollTop = box.scrollHeight;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", fitToViewport);
  window.visualViewport.addEventListener("scroll", fitToViewport);
}
$("msg-input").addEventListener("focus", () => {
  setTimeout(fitToViewport, 50);
  setTimeout(fitToViewport, 300);   // iOS animates the keyboard, so re-check after it finishes
});
$("msg-input").addEventListener("blur", () => {
  const appEl = $("app");
  appEl.style.height = "";
  appEl.style.top = "";
});

/* ---------------- Boot ---------------- */
(async function boot() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (s && s.id) {
      const snap = await get(ref(db, "users/" + s.id));
      if (snap.exists()) { startApp({ id: s.id, username: snap.val().username, isSpecial: false }); return; }
      const specialSnap = await get(ref(db, "special_user/" + s.id));
      if (specialSnap.exists()) { startApp({ id: s.id, username: specialSnap.val().username, isSpecial: true }); return; }
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (e) { /* fall through to login */ }
  $("login-view").classList.remove("hidden");
})();
