import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import * as fs from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAIL } from "./config.js";
// A separate named app keeps the admin sign-in apart from the website's QR login in the same browser.
const app = initializeApp(firebaseConfig, "admin");
export const auth = getAuth(app), db = fs.getFirestore(app);
export { fs, signInAnonymously, signInWithEmailAndPassword, signOut, ADMIN_EMAIL };
const { doc, onSnapshot } = fs;
export function kick(msg) { if (msg) sessionStorage.setItem("tp_admin_msg", msg); signOut(auth).catch(() => {}).finally(() => location.replace("index.html")); }
export async function requireAdmin() {
  const user = await new Promise((r) => { const s = onAuthStateChanged(auth, (u) => { s(); r(u); }); });
  if (!user || user.isAnonymous) return kick();
  const mine = Number((await user.getIdTokenResult()).claims.auth_time);
  onSnapshot(doc(db, "adminSession", "current"), (s) => { if (!s.exists() || s.data().authTime !== mine) kick("This admin login was replaced by another device."); }, () => kick("Session ended. Log in again."));
  return user;
}
