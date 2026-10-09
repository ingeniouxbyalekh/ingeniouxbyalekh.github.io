/* Shows the signed-in user in the navbar on every page.
   A user counts as signed in only after registration step 2 (profile + phone) is saved. */
import { auth, hasCompletedProfile } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const box = document.getElementById("userbox");
const signedOutView = () => { if (box) box.innerHTML = `<a class="btn" href="login.html">Sign In</a>`; };
onAuthStateChanged(auth, async user => {
  if (!box) return;
  if (user && !(await hasCompletedProfile(user))) {
    // Half-finished registration: not a login. Drop the session.
    signedOutView();
    try { await signOut(auth); } catch (e) { console.error(e); }
    return;
  }
  if (user) {
    const name = (user.displayName || user.email || "Reader").split(" ")[0];
    box.innerHTML = `<a href="profile.html" title="My profile" style="text-decoration:none;color:inherit"><span class="meta">Hi, </span><b style="font-family:Sora,sans-serif;font-size:.85rem;border-bottom:1.5px solid currentColor"></b></a><button class="alt" id="lo">Sign Out</button>`;
    box.querySelector("b").textContent = name;
    document.getElementById("lo").onclick = () => signOut(auth);
  } else {
    signedOutView();
  }
});
