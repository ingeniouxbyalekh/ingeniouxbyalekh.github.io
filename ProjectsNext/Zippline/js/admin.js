import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, remove, push, onValue,
  query, orderByChild, equalTo, serverTimestamp
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
const ADMIN_KEY = "chatbox_admin_ok";
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

async function hash(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("chatbox::" + pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function usernameTaken(name, exceptId) {
  // Usernames must be unique across both regular accounts and special users,
  // since login resolves a username to a single account.
  const [usersSnap, specialSnap] = await Promise.all([
    get(query(ref(db, "users"), orderByChild("username"), equalTo(name))),
    get(query(ref(db, "special_user"), orderByChild("username"), equalTo(name)))
  ]);
  let taken = false;
  usersSnap.forEach(c => { if (c.key !== exceptId) taken = true; });
  specialSnap.forEach(c => { if (c.key !== exceptId) taken = true; });
  return taken;
}

/* ---------------- Gate ---------------- */
let setupMode = false;

async function initGate() {
  if (sessionStorage.getItem(ADMIN_KEY) === "1") { showPanel(); return; }
  $("gate").classList.remove("hidden");
  try {
    const snap = await get(ref(db, "admin/passHash"));
    setupMode = !snap.exists();
  } catch (e) {
    $("gate-error").textContent = "Cannot reach the database. Check your connection and database rules.";
    return;
  }
  if (setupMode) {
    $("gate-title").textContent = "Set admin password";
    $("gate-sub").textContent = "No admin password exists yet. Choose one to protect this page.";
    $("g-label").textContent = "New password";
    $("g-pass").autocomplete = "new-password";
    $("g-confirm-wrap").classList.remove("hidden");
    $("g-pass2").required = true;
    $("gate-btn").textContent = "Save password";
  }
}

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("gate-error");
  err.textContent = "";
  const pw = $("g-pass").value;
  try {
    if (setupMode) {
      if (pw.length < 6) { err.textContent = "Use at least 6 characters."; return; }
      if (pw !== $("g-pass2").value) { err.textContent = "Passwords do not match."; return; }
      await set(ref(db, "admin/passHash"), await hash(pw));
    } else {
      const snap = await get(ref(db, "admin/passHash"));
      if (snap.val() !== await hash(pw)) { err.textContent = "Incorrect password."; return; }
    }
    sessionStorage.setItem(ADMIN_KEY, "1");
    $("g-pass").value = ""; $("g-pass2").value = "";
    showPanel();
  } catch (ex) {
    err.textContent = "Something went wrong. Check your connection and try again.";
  }
});

$("signout").addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_KEY);
  location.reload();
});

/* ---------------- Panel ---------------- */
let users = [];
let editingId = null;
let specialUsers = [];
let editingSpecialId = null;
let listening = false;

function showPanel() {
  $("gate").classList.add("hidden");
  $("panel").classList.remove("hidden");
  if (listening) return;
  listening = true;
  onValue(ref(db, "users"), (snap) => {
    users = [];
    snap.forEach(c => users.push({ id: c.key, ...c.val() }));
    users.sort((a, b) => a.username.localeCompare(b.username));
    renderUsers();
  });
  onValue(ref(db, "special_user"), (snap) => {
    specialUsers = [];
    snap.forEach(c => specialUsers.push({ id: c.key, ...c.val() }));
    specialUsers.sort((a, b) => a.username.localeCompare(b.username));
    renderSpecialUsers();
  });
}

function renderUsers() {
  $("count").textContent = users.length ? "(" + users.length + ")" : "";
  const box = $("users-box");
  box.innerHTML = "";
  if (!users.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "No accounts yet. Create the first one above.";
    box.append(d);
    return;
  }
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Username</th><th>Password</th><th>Created</th><th></th></tr></thead>";
  const tb = document.createElement("tbody");

  for (const u of users) {
    const tr = document.createElement("tr");
    const editing = editingId === u.id;

    const tdName = document.createElement("td");
    const tdPass = document.createElement("td");
    const tdDate = document.createElement("td");
    const tdAct = document.createElement("td");
    tdAct.className = "actions";

    tdDate.className = "muted";
    tdDate.textContent = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "";

    if (editing) {
      const nameIn = document.createElement("input");
      nameIn.type = "text"; nameIn.value = u.username; nameIn.setAttribute("aria-label", "Username");
      nameIn.autocapitalize = "off";
      const passIn = document.createElement("input");
      passIn.type = "text"; passIn.placeholder = "Leave blank to keep current";
      passIn.setAttribute("aria-label", "New password");
      tdName.append(nameIn); tdPass.append(passIn);

      const save = document.createElement("button");
      save.className = "btn sm"; save.textContent = "Save changes";
      save.addEventListener("click", async () => {
        const name = nameIn.value.trim().toLowerCase();
        const pw = passIn.value;
        if (!USERNAME_RE.test(name)) { toast("Username must be 3–20 letters, numbers or underscores."); return; }
        if (pw && pw.length < 4) { toast("Password needs at least 4 characters."); return; }
        save.disabled = true;
        try {
          if (await usernameTaken(name, u.id)) { toast("That username is already taken."); save.disabled = false; return; }
          const patch = { username: name };
          if (pw) patch.passHash = await hash(pw);
          await update(ref(db, "users/" + u.id), patch);
          editingId = null;
          toast("Saved");
        } catch (ex) { toast("Could not save. Try again."); save.disabled = false; }
      });
      const cancel = document.createElement("button");
      cancel.className = "btn ghost sm"; cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => { editingId = null; renderUsers(); });
      tdAct.append(save, cancel);
    } else {
      tdName.className = "uname"; tdName.textContent = u.username;
      tdPass.className = "muted"; tdPass.textContent = "Hidden";
      const edit = document.createElement("button");
      edit.className = "btn ghost sm"; edit.textContent = "Edit";
      edit.addEventListener("click", () => { editingId = u.id; renderUsers(); });
      const del = document.createElement("button");
      del.className = "btn danger sm"; del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm("Delete the account \"" + u.username + "\"? They will be signed out.")) return;
        try { await remove(ref(db, "users/" + u.id)); toast("Account deleted"); }
        catch (ex) { toast("Could not delete. Try again."); }
      });
      tdAct.append(edit, del);
    }
    tr.append(tdName, tdPass, tdDate, tdAct);
    tb.append(tr);
  }
  table.append(tb);
  const scroller = document.createElement("div");
  scroller.style.overflowX = "auto";
  scroller.append(table);
  box.append(scroller);
}

function renderSpecialUsers() {
  $("special-count").textContent = specialUsers.length ? "(" + specialUsers.length + ")" : "";
  const box = $("special-users-box");
  box.innerHTML = "";
  if (!specialUsers.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "No special users yet. Create one above.";
    box.append(d);
    return;
  }
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Username</th><th>Password</th><th>Created</th><th></th></tr></thead>";
  const tb = document.createElement("tbody");

  for (const u of specialUsers) {
    const tr = document.createElement("tr");
    const editing = editingSpecialId === u.id;

    const tdName = document.createElement("td");
    const tdPass = document.createElement("td");
    const tdDate = document.createElement("td");
    const tdAct = document.createElement("td");
    tdAct.className = "actions";

    tdDate.className = "muted";
    tdDate.textContent = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "";

    if (editing) {
      const nameIn = document.createElement("input");
      nameIn.type = "text"; nameIn.value = u.username; nameIn.setAttribute("aria-label", "Username");
      nameIn.autocapitalize = "off";
      const passIn = document.createElement("input");
      passIn.type = "text"; passIn.placeholder = "Leave blank to keep current";
      passIn.setAttribute("aria-label", "New password");
      tdName.append(nameIn); tdPass.append(passIn);

      const save = document.createElement("button");
      save.className = "btn sm"; save.textContent = "Save changes";
      save.addEventListener("click", async () => {
        const name = nameIn.value.trim().toLowerCase();
        const pw = passIn.value;
        if (!USERNAME_RE.test(name)) { toast("Username must be 3–20 letters, numbers or underscores."); return; }
        if (pw && pw.length < 4) { toast("Password needs at least 4 characters."); return; }
        save.disabled = true;
        try {
          if (await usernameTaken(name, u.id)) { toast("That username is already taken."); save.disabled = false; return; }
          const patch = { username: name };
          if (pw) patch.passHash = await hash(pw);
          await update(ref(db, "special_user/" + u.id), patch);
          editingSpecialId = null;
          toast("Saved");
        } catch (ex) { toast("Could not save. Try again."); save.disabled = false; }
      });
      const cancel = document.createElement("button");
      cancel.className = "btn ghost sm"; cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => { editingSpecialId = null; renderSpecialUsers(); });
      tdAct.append(save, cancel);
    } else {
      tdName.className = "uname"; tdName.textContent = u.username;
      const badge = document.createElement("span");
      badge.className = "badge"; badge.textContent = "Special";
      tdName.append(badge);
      tdPass.className = "muted"; tdPass.textContent = "Hidden";
      const edit = document.createElement("button");
      edit.className = "btn ghost sm"; edit.textContent = "Edit";
      edit.addEventListener("click", () => { editingSpecialId = u.id; renderSpecialUsers(); });
      const del = document.createElement("button");
      del.className = "btn danger sm"; del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm("Delete the special user \"" + u.username + "\"? They will be signed out.")) return;
        try { await remove(ref(db, "special_user/" + u.id)); toast("Special user deleted"); }
        catch (ex) { toast("Could not delete. Try again."); }
      });
      tdAct.append(edit, del);
    }
    tr.append(tdName, tdPass, tdDate, tdAct);
    tb.append(tr);
  }
  table.append(tb);
  const scroller = document.createElement("div");
  scroller.style.overflowX = "auto";
  scroller.append(table);
  box.append(scroller);
}

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("add-error");
  err.textContent = "";
  const name = $("a-user").value.trim().toLowerCase();
  const pw = $("a-pass").value;
  if (!USERNAME_RE.test(name)) { err.textContent = "Username must be 3–20 lowercase letters, numbers or underscores."; return; }
  if (pw.length < 4) { err.textContent = "Password needs at least 4 characters."; return; }
  $("add-btn").disabled = true;
  try {
    if (await usernameTaken(name)) { err.textContent = "That username is already taken."; return; }
    await push(ref(db, "users"), { username: name, passHash: await hash(pw), createdAt: serverTimestamp() });
    $("a-user").value = ""; $("a-pass").value = "";
    toast("Account created");
  } catch (ex) {
    err.textContent = "Could not create the account. Check your connection and database rules.";
  } finally {
    $("add-btn").disabled = false;
  }
});

$("add-special-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("add-special-error");
  err.textContent = "";
  const name = $("as-user").value.trim().toLowerCase();
  const pw = $("as-pass").value;
  if (!USERNAME_RE.test(name)) { err.textContent = "Username must be 3–20 lowercase letters, numbers or underscores."; return; }
  if (pw.length < 4) { err.textContent = "Password needs at least 4 characters."; return; }
  $("add-special-btn").disabled = true;
  try {
    if (await usernameTaken(name)) { err.textContent = "That username is already taken."; return; }
    await push(ref(db, "special_user"), { username: name, passHash: await hash(pw), createdAt: serverTimestamp() });
    $("as-user").value = ""; $("as-pass").value = "";
    toast("Special user created");
  } catch (ex) {
    err.textContent = "Could not create the special user. Check your connection and database rules.";
  } finally {
    $("add-special-btn").disabled = false;
  }
});

$("admin-pass-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("ap-error");
  err.textContent = "";
  const a = $("ap-new").value, b = $("ap-new2").value;
  if (a.length < 6) { err.textContent = "Use at least 6 characters."; return; }
  if (a !== b) { err.textContent = "Passwords do not match."; return; }
  try {
    await set(ref(db, "admin/passHash"), await hash(a));
    $("ap-new").value = ""; $("ap-new2").value = "";
    toast("Admin password updated");
  } catch (ex) { err.textContent = "Could not update the password. Try again."; }
});

initGate();
