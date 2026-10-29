import { db, fs, waitForUser } from "./firebase.js";
import { BUILT_IN, CATS, CAT_OWN, compute } from "./engine.js";
import { icon, avatarStyle, gauge, sparkline, tiles, bars, histRow, summary, decorate, emptyDetail, dhead } from "./ui.js";
const { doc, getDoc, setDoc, serverTimestamp, updateDoc, deleteDoc, collection, onSnapshot } = fs;
const $ = (id) => document.getElementById(id), SID = "tp_web_sid", DAY = 864e5;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100);
const norm = (p) => { const d = String(p).replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
const sha1 = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const say = (t) => { $("msg").textContent = t; $("msg").hidden = !t; };
const toast = (t) => { $("toast").innerHTML = icon("check") + esc(t); $("toast").hidden = false; setTimeout(() => ($("toast").hidden = true), 1800); };
const guard = (f) => async (...a) => { try { await f(...a); } catch (e) { say(/permission/i.test(e.message) ? "Not allowed by the Firestore rules. Publish the updated firestore.rules." : e.message); } };
let email, name, sid, contacts = [], acts = [], emos = [], open = null, cat = "", emo = "", refocus = null, loaded = 0;
const bounce = () => { localStorage.removeItem(SID); location.replace("../index.html"); };
const base = () => `users/${email}/backup`;

async function start() {
  const user = await waitForUser();
  sid = localStorage.getItem(SID);
  if (!sid) return bounce();
  const d = (await getDoc(doc(db, "webLogin", sid)).catch(() => null))?.data();
  if (!d || d.webUid !== user.uid || d.status !== "approved") return bounce();
  await setDoc(doc(db, "webSessions", user.uid), { sid, at: serverTimestamp() }).catch(() => {});
  email = d.email.toLowerCase(); name = d.name || email;
  $("meav").textContent = name[0].toUpperCase(); $("meav").style.cssText = avatarStyle(name); $("mename").textContent = name; $("memail").textContent = email;
  onSnapshot(doc(db, "webLogin", sid), (s) => { if (!s.exists() || ["revoked", "loggedout"].includes(s.data().status)) bounce(); });
  const err = (e) => say(/permission/i.test(e.message) ? "Your cloud backup could not be read. Publish the updated firestore.rules." : "Could not read your data: " + e.message);
  const watch = (p, set) => onSnapshot(collection(db, base() + p), (s) => { set(s.docs.map((x) => ({ id: x.id, key: x.id, ...x.data() }))); loaded++; render(); }, err);
  watch("/contacts/list", (r) => (contacts = r)); watch("/activity/list", (r) => (acts = r)); watch("/emotions/list", (r) => (emos = r));
}
const histOf = (k) => acts.filter((a) => a.phoneKey === k).sort((a, b) => b.timestamp - a.timestamp);
const stat = (c) => { const h = histOf(c.key), b = +c.basePoints || 0; return { h, b, total: b + h.reduce((s, x) => s + x.points, 0), t: compute(h, b) }; };
const allEmotions = () => [...BUILT_IN, ...emos.map((e) => ({ ...e, category: CAT_OWN }))];
const shut = () => { open = null; cat = emo = ""; render(); };
function render() { if (!email) return; renderList(); renderDetail(); }

function renderList() {
  const q = $("q").value.trim().toLowerCase(), dg = q.replace(/\D/g, "");
  const rows = contacts.map((c) => ({ c, ...stat(c) })).filter(({ c }) => !q || (c.name || "").toLowerCase().includes(q) || (dg && norm(c.phone).includes(dg)))
    .sort((a, b) => b.total - a.total || (a.c.name || "").localeCompare(b.c.name || ""));
  $("count").textContent = loaded >= 3 ? `${rows.length} of ${contacts.length} contacts` : "";
  $("summary").hidden = !(loaded >= 3 && contacts.length);
  if (!$("summary").hidden) $("summary").innerHTML = summary(contacts.length, contacts.map((c) => stat(c).t));
  const keep = $("list").scrollTop;
  $("list").innerHTML = rows.map(({ c, total, t }) => `<button class="row ${c.key === open ? "on" : ""}" data-k="${esc(c.key)}"><div class="av" style="${avatarStyle(c.name)}">${esc((c.name || "?")[0].toUpperCase())}</div>
    <div class="g"><div class="n">${esc(c.name)}</div><div class="sub">${icon("phone")}<span>${esc(c.phone)}</span><span>·</span><span>${fmt(total)} pts</span></div>${t ? `<div class="meter ${t.band[2]}"><i style="width:${t.percent.toFixed(0)}%"></i></div>` : ""}</div>
    ${t ? `<span class="pill ${t.band[2]}">${Math.round(t.percent)}%</span>` : '<span class="muted">No data</span>'}${icon("chevron", "go")}</button>`).join("")
    || (contacts.length ? `<div class="empty">${icon("search")}<b>No contact matches</b>Try a different name or number.</div>`
      : loaded >= 3 ? `<div class="empty">${icon("inbox")}<b>Nothing backed up yet</b>In the app open Settings, Cloud backup, then tap Backup or turn on Automatic backup.</div>`
      : '<div class="skel"></div><div class="skel"></div><div class="skel"></div>');
  $("list").scrollTop = keep;
}
function renderDetail() {
  const box = $("detail"), c = contacts.find((x) => x.key === open);
  $("split").classList.toggle("open", !!c);
  if (!c) { if (open) return shut(); box.innerHTML = emptyDetail(); return; }
  const { h, b, total, t } = stat(c), pos = h.filter((x) => x.points > 0).length, neg = h.filter((x) => x.points < 0).length;
  const cnt = {}; h.forEach((x) => (cnt[x.emotionName] = (cnt[x.emotionName] || 0) + 1));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const pct = t ? t.percent : 0, cls = t ? t.band[2] : "";
  const pts = []; if (h.length) { const end = Date.now(); for (let i = 29; i >= 0; i--) pts.push(compute(h, b, end - i * DAY)?.percent ?? 50); }
  const list = cat ? allEmotions().filter((e) => e.category === cat).sort((a, b) => b.points - a.points) : [];
  const picked = list.find((e) => e.name === emo);
  const TL = { [CATS[0]]: "Hurtful actions (Red flags)", [CATS[1]]: "Good actions (Green flags)", [CATS[2]]: "My own" };
  box.innerHTML = `${dhead(c, t ? `<span class="pill ${cls}">${t.band[0]}</span>` : "")}
    <div class="dgrid">
      ${t?.safety ? `<div class="alert c12" role="alert">${icon("alert")}<p>A serious betrayal was logged in the last 30 days, so trust is held down.</p></div>` : ""}
      <div class="card c5"><div class="hero">${gauge(pct, cls, !!t)}
        <div class="facts"><span class="band ${cls}">${t ? t.band[0] : "No data yet"}</span><span class="muted">${t ? t.band[1] : "Add an emotion to start."}</span><span>${fmt(total)} points <span class="muted">(default ${fmt(b)})</span></span></div></div></div>
      <div class="c7">${tiles([["activity", "Entries", h.length], ["clock", "Last 7 days", h.filter((x) => x.timestamp > Date.now() - 7 * DAY).length],
        ["smile", "Good", (pos + neg ? Math.round(pos / (pos + neg) * 100) : 0) + "%"], ["calendar", "Last entry", h[0] ? new Date(h[0].timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "–"]])}</div>
      <div class="card c5"><h3>${icon("plus")}Add an emotion</h3>
        <label class="fld"><span>${icon("flag")}Type</span><select id="catSel"><option value="">Choose a type…</option>${CATS.map((k) => `<option value="${esc(k)}" ${cat === k ? "selected" : ""}>${esc(TL[k] || k)}</option>`).join("")}</select></label>
        <label class="fld"><span>${icon("smile")}What happened</span><select id="emoSel" ${cat && list.length ? "" : "disabled"}><option value="">${!cat ? "Choose a type first" : list.length ? "Choose what happened…" : "No emotions in this group"}</option>${list.map((e) => `<option value="${esc(e.name)}" ${emo === e.name ? "selected" : ""}>${esc(e.name)} (${fmt(e.points)})</option>`).join("")}</select></label>
        <div class="addrow">${picked ? `<span class="prev ${picked.points < 0 ? "bad" : "ok"}">${fmt(picked.points)} points</span>` : ""}<button data-add ${picked ? "" : "disabled"}>${icon("plus")}Add emotion</button></div>
        <p class="fine">${icon("info")}<span>Entries added here save to your cloud backup. The next Backup from the app can remove them unless you restore them to the phone first.</span></p></div>
      ${pts.length ? `<div class="card c7"><h3>${icon("trend")}Trust, last 30 days</h3>${sparkline(pts, cls)}</div>` : ""}
      ${top.length ? `<div class="card c5"><h3>${icon("chart")}Most logged</h3>${bars(top)}</div>` : ""}
      <div class="card ${top.length ? "c7" : "c12"}"><h3>${icon("history")}History</h3><div class="hlist">${h.map((x) => histRow(x, true)).join("") || '<p class="muted">Nothing logged yet.</p>'}</div></div>
    </div>`;
  if (refocus) { const f = $(refocus); refocus = null; f && !f.disabled && f.focus(); }
}
document.addEventListener("click", guard(async (ev) => {
  const t = ev.target.closest("button"); if (!t) return;
  const c = contacts.find((x) => x.key === open);
  if (t.id === "logout") { await updateDoc(doc(db, "webLogin", sid), { status: "loggedout" }).catch(() => {}); await deleteDoc(doc(db, "webSessions", (await waitForUser()).uid)).catch(() => {}); return bounce(); }
  if (t.id === "back") return shut();
  if (t.dataset.k) { open = t.dataset.k; cat = emo = ""; if (matchMedia("(max-width:900px)").matches) scrollTo(0, 0); return render(); }
  if (t.dataset.add !== undefined && c) {
    const e = allEmotions().find((x) => x.name === emo && x.category === cat), ts = Date.now();
    if (!e) return;
    await setDoc(doc(db, base() + "/activity/list", await sha1(`${c.key}|${ts}|${e.name}`)), { phoneKey: c.key, contactName: c.name || "", emotionName: e.name, points: e.points, timestamp: ts });
    emo = ""; refocus = "emoSel"; renderDetail(); return toast("Emotion added");
  }
  if (t.dataset.del && confirm("Delete this entry?")) return deleteDoc(doc(db, base() + "/activity/list", t.dataset.del));
}));
document.addEventListener("change", (ev) => {
  if (ev.target.id === "catSel") { cat = ev.target.value; emo = ""; refocus = cat ? "emoSel" : "catSel"; renderDetail(); }
  else if (ev.target.id === "emoSel") { emo = ev.target.value; refocus = "emoSel"; renderDetail(); }
});
decorate();
$("q").addEventListener("input", renderList);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open && !/SELECT|INPUT/.test(document.activeElement.tagName)) shut(); });
renderDetail();
start().catch((e) => say(e.message));
