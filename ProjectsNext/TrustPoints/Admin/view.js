import { db, fs, requireAdmin, logout } from "./fb.js";
import { compute } from "../dashboard/js/engine.js";
import { icon, avatarStyle, gauge, sparkline, tiles, bars, histRow, summary, decorate, emptyDetail, dhead } from "../dashboard/js/ui.js";
const { collection, getDocs, onSnapshot } = fs, DAY = 864e5, $ = (i) => document.getElementById(i);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100), norm = (p) => { const d = String(p).replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
const say = (t) => { $("msg").textContent = t; $("msg").hidden = !t; };
const email = (new URLSearchParams(location.search).get("u") || "").toLowerCase();
let contacts = [], acts = [], emos = [], open = null, loaded = 0, need = 3, ids = [];
const data = {};
const epoch = (id) => (id === email ? 1 : parseInt(id.slice(email.length + 1)) || 1);
function merge() {   // permanentData keeps one tree per sign-in; the union of them is the full history
  const m = { c: new Map(), a: new Map(), e: new Map() };
  [...ids].sort((x, y) => epoch(x) - epoch(y)).forEach((id) => { const d = data[id] || {}; (d.c || []).forEach((x) => m.c.set(x.key, x)); (d.a || []).forEach((x) => m.a.set(x.id, x)); (d.e || []).forEach((x) => m.e.set(x.id, x)); });
  contacts = [...m.c.values()]; acts = [...m.a.values()]; emos = [...m.e.values()];
}
const histOf = (k) => acts.filter((a) => a.phoneKey === k).sort((a, b) => b.timestamp - a.timestamp);
const stat = (c) => { const h = histOf(c.key), b = +c.basePoints || 0; return { h, b, total: b + h.reduce((s, x) => s + x.points, 0), t: compute(h, b) }; };
const shut = () => { open = null; render(); };
function render() {
  merge();
  const q = $("q").value.trim().toLowerCase(), dg = q.replace(/\D/g, "");
  const rows = contacts.map((c) => ({ c, ...stat(c) })).filter(({ c }) => !q || (c.name || "").toLowerCase().includes(q) || (dg && norm(c.phone).includes(dg))).sort((a, b) => b.total - a.total || (a.c.name || "").localeCompare(b.c.name || ""));
  $("count").textContent = loaded >= need ? `${rows.length} of ${contacts.length} contacts` : "";
  $("emos").innerHTML = emos.length ? `<span class="muted">${icon("smile")} Emotions</span>` + [...emos].sort((a, b) => b.points - a.points).map((e) => `<span class="chip2">${esc(e.name)} <b class="${e.points < 0 ? "bad" : "ok"}">${fmt(e.points)}</b></span>`).join("") : "";
  $("summary").hidden = !(loaded >= need && contacts.length);
  if (!$("summary").hidden) $("summary").innerHTML = summary(contacts.length, contacts.map((c) => stat(c).t));
  $("list").innerHTML = rows.map(({ c, total, t }) => `<button class="row" data-k="${esc(c.key)}"><div class="av" style="${avatarStyle(c.name)}">${esc((c.name || "?")[0].toUpperCase())}</div><div class="g"><div class="n">${esc(c.name)}</div><div class="sub">${icon("phone")}<span>${esc(c.phone)}</span><span>·</span><span>${fmt(total)} pts</span></div>${t ? `<div class="meter ${t.band[2]}"><i style="width:${t.percent.toFixed(0)}%"></i></div>` : ""}</div>${t ? `<span class="pill ${t.band[2]}">${Math.round(t.percent)}%</span>` : '<span class="muted">No data</span>'}${icon("chevron", "go")}</button>`).join("")
    || (loaded >= need ? `<div class="empty">${icon("inbox")}<b>No backup yet</b>This user has not backed up any contacts.</div>` : '<div class="skel"></div><div class="skel"></div><div class="skel"></div>');
  detail();
}
function detail() {
  const c = contacts.find((x) => x.key === open);
  $("split").classList.toggle("open", !!c);
  if (!c) { if (open) return shut(); $("detail").innerHTML = emptyDetail(); return; }
  const { h, b, total, t } = stat(c), pos = h.filter((x) => x.points > 0).length, neg = h.filter((x) => x.points < 0).length, pct = t ? t.percent : 0, cls = t ? t.band[2] : "";
  const cnt = {}; h.forEach((x) => (cnt[x.emotionName] = (cnt[x.emotionName] || 0) + 1)); const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const pts = []; if (h.length) for (let i = 29; i >= 0; i--) pts.push(compute(h, b, Date.now() - i * DAY)?.percent ?? 50);
  $("detail").innerHTML = `${dhead(c, t ? `<span class="pill ${cls}">${t.band[0]}</span>` : "")}<div class="dgrid">
    ${t?.safety ? `<div class="alert c12" role="alert">${icon("alert")}<p>Serious betrayal in the last 30 days.</p></div>` : ""}
    <div class="card c5"><div class="hero">${gauge(pct, cls, !!t)}<div class="facts"><span class="band ${cls}">${t ? t.band[0] : "No data"}</span><span>${fmt(total)} points</span></div></div></div>
    <div class="c7">${tiles([["activity", "Entries", h.length], ["clock", "Last 7 days", h.filter((x) => x.timestamp > Date.now() - 7 * DAY).length], ["smile", "Good", (pos + neg ? Math.round(pos / (pos + neg) * 100) : 0) + "%"], ["calendar", "Last entry", h[0] ? new Date(h[0].timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "–"]])}</div>
    ${pts.length ? `<div class="card c7"><h3>${icon("trend")}Trust, last 30 days</h3>${sparkline(pts, cls)}</div>` : ""}
    ${top.length ? `<div class="card c5"><h3>${icon("chart")}Most logged</h3>${bars(top)}</div>` : ""}
    <div class="card c12"><h3>${icon("history")}Emotions logged</h3><div class="hlist">${h.map((x) => histRow(x, false)).join("") || '<p class="muted">No entries.</p>'}</div></div></div>`;
}
requireAdmin().then(async (user) => {
  if (!user) return;
  if (!email) return location.replace("users.html");
  const err = (e) => say("Could not read this user: " + e.message);
  const all = await getDocs(collection(db, "permanentData")).catch((e) => (err(e), { docs: [] }));
  let name = "";
  all.docs.forEach((d) => { const x = d.data(), det = x.details || {}, e = String(x.baseEmail || det.email || d.id.replace(/-\d+$/, "")).toLowerCase(); if (e === email) { ids.push(d.id); name = det.name || name; } });
  $("mename").textContent = name || email; $("memail").textContent = email; $("meav").textContent = (name || email)[0].toUpperCase(); $("meav").style.cssText = avatarStyle(name || email);
  need = Math.max(1, ids.length * 3); if (!ids.length) { loaded = need; return render(); }
  ids.forEach((id) => { data[id] = {}; const watch = (p, k) => onSnapshot(collection(db, `permanentData/${id}/backup/${p}/list`), (s) => { data[id][k] = s.docs.map((x) => ({ id: x.id, key: x.id, ...x.data() })); loaded++; render(); }, err); watch("contacts", "c"); watch("activity", "a"); watch("emotions", "e"); });
});
document.addEventListener("click", (ev) => { const t = ev.target.closest("button"); if (!t) return; if (t.id === "logout") return logout(); if (t.id === "back") return shut(); if (t.dataset.k) { open = t.dataset.k; if (matchMedia("(max-width:900px)").matches) scrollTo(0, 0); render(); } });
decorate(); $("detail").innerHTML = emptyDetail(); $("allUsers").innerHTML = icon("users") + "<span>All users</span>";
$("q").addEventListener("input", render);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) shut(); });
