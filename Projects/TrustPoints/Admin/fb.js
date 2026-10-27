import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import * as fs from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import * as rt from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";
import { firebaseConfig } from "./config.js";
// A separate named app keeps the admin sign-in apart from the website's QR login in the same browser.
const app = initializeApp(firebaseConfig, "admin");
export const auth = getAuth(app), db = fs.getFirestore(app), rtdb = rt.getDatabase(app);
export { fs, rt, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut };
const { doc, onSnapshot } = fs;
export function describeDevice() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "a computer";
  return `${b} on ${o}`;
}
export const deviceId = () => localStorage.tp_admin_dev || (localStorage.tp_admin_dev = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join(""));
export function kick(msg) { if (msg) sessionStorage.setItem("tp_admin_msg", msg); signOut(auth).catch(() => {}).finally(() => location.replace("index.html")); }
// User pressed Log out: archive this login into Admin/pastLogins, then sign out.
export async function logout() {
  try {
    const mine = Number((await auth.currentUser.getIdTokenResult()).claims.auth_time);
    const cur = (await rt.get(rt.ref(rtdb, "Admin/currentLogin"))).val();
    if (cur && cur.authTime === mine) {
      await rt.set(rt.push(rt.ref(rtdb, "Admin/pastLogins")), { ...cur, endedAt: rt.serverTimestamp(), endedReason: "logged out" });
      await rt.set(rt.ref(rtdb, "Admin/currentLogin"), null);
    }
  } catch (_) { /* sign out anyway */ }
  kick();
}
export async function requireAdmin() {
  const user = await new Promise((r) => { const s = onAuthStateChanged(auth, (u) => { s(); r(u); }); });
  if (!user || user.isAnonymous) return kick();
  const mine = Number((await user.getIdTokenResult()).claims.auth_time);
  onSnapshot(doc(db, "adminSession", "current"), (s) => { if (!s.exists() || s.data().authTime !== mine) kick("This admin login was replaced by another device."); }, () => kick("Session ended. Log in again."));
  return user;
}
