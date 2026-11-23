import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import * as fs from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyBgKBYEq4MBlx54ot9l5-T3wLf4KfD1394",
  authDomain: "trustpoints-a79af.firebaseapp.com",
  projectId: "trustpoints-a79af",
  storageBucket: "trustpoints-a79af.firebasestorage.app",
  messagingSenderId: "66808199035",
  appId: "1:66808199035:web:9aa0a13fb4f750be2a6fde"
});
export const auth = getAuth(app);
export const db = fs.getFirestore(app);
export { fs };
export const waitForUser = () => new Promise((res, rej) => {
  const stop = onAuthStateChanged(auth, async (u) => {
    stop();
    if (u) return res(u);
    try { res((await signInAnonymously(auth)).user); } catch (e) { rej(e); }
  });
});
