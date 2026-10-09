/* Poll tile (the only dynamic part of the home page).
   The poll is created in /Admin. Voting needs a signed-in account, one vote per account.
   Video, tweet and headlines are static: edit them at the top of script.js. */
import { auth, db, hasCompletedProfile } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, query, where, limit, getDocs, doc, getDoc, writeBatch, increment, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const box = $("tPoll");

(async () => {
  let p = null;
  try {
    const s = await getDocs(query(collection(db, "polls"), where("active", "==", true), limit(1)));
    if (s.empty) { box.innerHTML = '<div class="empty">No poll right now.</div>'; return; }
    p = { id: s.docs[0].id, ...s.docs[0].data() };
  } catch (e) { console.error("poll", e); box.innerHTML = '<div class="empty">Could not load. Please refresh.</div>'; return; }

  const counts = p.options.map((_, i) => (p.votes && p.votes[i]) || 0);
  let user = null, voted = null;

  const results = () => {
    const tot = counts.reduce((a, b) => a + b, 0);
    box.innerHTML = `<div class="poll"><b>${esc(p.question)}</b>` + p.options.map((o, i) => {
      const pc = tot ? Math.round(counts[i] * 100 / tot) : 0;
      return `<div class="res"><span>${esc(o)}</span><span>${pc}%</span></div><div class="bar"><div style="width:${pc}%"></div></div>`;
    }).join("") + `<div class="meta">${tot} total vote${tot === 1 ? "" : "s"}</div></div>`;
  };

  const ballot = () => {
    box.innerHTML = `<div class="poll"><b>${esc(p.question)}</b>` +
      p.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join("") +
      `</div>`;
    box.querySelectorAll(".opt").forEach(b => b.onclick = async () => {
      if (!user) { location.href = "login.html"; return; }
      const i = +b.dataset.i;
      box.querySelectorAll(".opt").forEach(x => x.disabled = true);
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, "polls", p.id, "voters", user.uid), { choice: i, at: serverTimestamp() });
        batch.update(doc(db, "polls", p.id), { ["votes." + i]: increment(1) });
        await batch.commit();
        counts[i]++; voted = { choice: i };
        results();
      } catch (e) {
        console.error(e);
        box.insertAdjacentHTML("beforeend", '<div class="meta">Vote failed. Try again.</div>');
        box.querySelectorAll(".opt").forEach(x => x.disabled = false);
      }
    });
  };

  onAuthStateChanged(auth, async u => {
    user = (u && await hasCompletedProfile(u)) ? u : null; voted = null;
    if (user) { try { const v = await getDoc(doc(db, "polls", p.id, "voters", user.uid)); if (v.exists()) voted = v.data(); } catch (e) { console.error(e); } }
    voted ? results() : ballot();
  });
})();
