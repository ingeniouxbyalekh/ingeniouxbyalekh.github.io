import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDd0XFNHreSmvOCj-rwcBufx_dDz1oq_Ls",
  authDomain: "ingenioux-disclosure.firebaseapp.com",
  projectId: "ingenioux-disclosure",
  storageBucket: "ingenioux-disclosure.firebasestorage.app",
  messagingSenderId: "743308257439",
  appId: "1:743308257439:web:208546a9236d6ce6e49aaa"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* A Google sign-in only counts as a real login once the 2nd registration step (profile + phone) was saved.
   Until then users/<uid>.profileComplete is missing, so every page treats the visitor as signed out.
   The admin account never has a profile document and is exempt. */
export const ADMIN_EMAIL = "admin@ingenioux.in";
export async function hasCompletedProfile(user) {
  if (!user) return false;
  if ((user.email || "").toLowerCase() === ADMIN_EMAIL) return true;
  try {
    const s = await getDoc(doc(db, "users", user.uid));
    return s.exists() && s.data().profileComplete === true;
  } catch (e) { console.error("profile check", e); return true; }   // read failed: don't lock real users out
}

/* Automatic sign-out: every signed-in user (visitors and admin) is logged out 2 hours after the moment they signed in.
   Uses Firebase's own "auth_time" (the original sign-in time; it does not change when the token refreshes),
   so reloading the page or reopening the browser does not extend the session. Change the number below to adjust. */
export const SESSION_MAX_MS = 2 * 60 * 60 * 1000;
let expiresAt = 0, sessionTick = null;
const expireNow = () => { clearInterval(sessionTick); sessionTick = null; expiresAt = 0; signOut(auth).catch(e => console.error("auto sign-out", e)); };
onAuthStateChanged(auth, async user => {
  clearInterval(sessionTick); sessionTick = null; expiresAt = 0;
  if (!user) return;
  let signedInAt = Date.now();
  try { signedInAt = Date.parse((await user.getIdTokenResult()).authTime) || signedInAt; } catch (e) { console.warn("auth_time unavailable", e); }
  expiresAt = signedInAt + SESSION_MAX_MS;
  if (Date.now() >= expiresAt) return expireNow();
  sessionTick = setInterval(() => { if (expiresAt && Date.now() >= expiresAt) expireNow(); }, 15000);   // also catches wake-from-sleep
});
