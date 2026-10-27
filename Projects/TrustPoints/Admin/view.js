import { db, fs, requireAdmin, logout } from "./fb.js";
import { compute } from "../dashboard/js/engine.js";
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
const shut = () => { open = null; $("pane").hidden = $("scrim").hidden = true; render(); };
function render() {
  merge();
  const q = $("q").value.trim().toLowerCase(), dg = q.replace(/\D/g, "");
  const rows = contacts.map((c) => ({ c, ...stat(c) })).filter(({ c }) => !q || (c.name || "").toLowerCase().includes(q) || (dg && norm(c.phone).includes(dg))).sort((a, b) => b.total - a.total || (a.c.name || "").localeCompare(b.c.name || ""));
  $("count").textContent = loaded >= need ? `${rows.length} of ${contacts.length} contacts` : "";
  $("emos").innerHTML = emos.length ? `<span class="muted">Their own emotions:</span>` + [...emos].sort((a, b) => b.points - a.points).map((e) => `<span class="chip2">${esc(e.name)} <b class="${e.points < 0 ? "bad" : "ok"}">${fmt(e.points)}</b></span>`).join("") : "";
  $("list").innerHTML = rows.map(({ c, total, t }) => `<button class="row" data-k="${esc(c.key)}"><div class="av">${esc((c.name || "?")[0].toUpperCase())}</div><div class="g"><div class="n">${esc(c.name)}</div><div class="muted">${esc(c.phone)} · ${fmt(total)} pts</div></div>${t ? `<span class="pill ${t.band[2]}">${Math.round(t.percent)}%</span>` : '<span class="muted">No data</span>'}</button>`).join("")
    || (loaded >= need ? '<div class="empty"><b>No backup for this user.</b><br>They have not backed up from the app yet.</div>' : '<p class="muted">Loading</p>');
  if (open) detail();
}
function detail() {
  const c = contacts.find((x) => x.key === open); if (!c) return shut();
  const { h, b, total, t } = stat(c), pos = h.filter((x) => x.points > 0).length, neg = h.filter((x) => x.points < 0).length, pct = t ? t.percent : 0, cls = t ? t.band[2] : "";
  const cnt = {}; h.forEach((x) => (cnt[x.emotionName] = (cnt[x.emotionName] || 0) + 1)); const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4), tm = Math.max(1, ...top.map((x) => x[1]));
  const pts = []; if (h.length) for (let i = 29; i >= 0; i--) pts.push(compute(h, b, Date.now() - i * DAY)?.percent ?? 50);
  $("detail").innerHTML = `<h2>${esc(c.name)}</h2><div class="muted">${esc(c.phone)}</div>
  <div class="top"><div class="gauge ${cls}"><svg viewBox="0 0 120 120"><circle class="t" cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52" stroke-dasharray="${(pct / 100 * 326.7).toFixed(1)} 326.7"/></svg><b>${t ? Math.round(pct) + "%" : "–"}</b></div>
  <div class="facts"><span class="band ${cls}">${t ? t.band[0] : "No data yet"}</span><span class="muted">${t ? t.band[1] : ""}</span><span>${fmt(total)} points <span class="muted">(default ${fmt(b)})</span></span></div></div>
  ${t?.safety ? '<p class="bad">A serious betrayal was logged in the last 30 days, so trust is held down.</p>' : ""}
  <h3>Statistics</h3><div class="tiles"><div class="tile"><span class="muted">Entries</span><b>${h.length}</b></div><div class="tile"><span class="muted">Last 7 days</span><b>${h.filter((x) => x.timestamp > Date.now() - 7 * DAY).length}</b></div><div class="tile"><span class="muted">Good</span><b>${pos + neg ? Math.round(pos / (pos + neg) * 100) : 0}%</b></div><div class="tile"><span class="muted">Last entry</span><b>${h[0] ? new Date(h[0].timestamp).toLocaleDateString() : "–"}</b></div></div>
  ${pts.length ? `<h3>Trust, last 30 days</h3><svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none"><path d="${pts.map((p, i) => `${i ? "L" : "M"}${(i / 29 * 300).toFixed(1)},${(65 - p * .6).toFixed(1)}`).join("")}"/></svg>` : ""}
  ${top.length ? `<h3>Most logged</h3>${top.map(([n, v]) => `<div class="br"><span>${esc(n)}</span><i style="width:${v / tm * 40}%"></i>${v}</div>`).join("")}` : ""}
  <h3>Emotions logged</h3>${h.map((x) => `<div class="hist"><div>${esc(x.emotionName)} <b class="${x.points < 0 ? "bad" : "ok"}">${fmt(x.points)}</b><div class="muted">${new Date(x.timestamp).toLocaleString()}</div></div></div>`).join("") || '<p class="muted">Nothing logged yet.</p>'}`;
}
requireAdmin().then(async (user) => {
  if (!user) return;
  if (!email) return location.replace("users.html");
  const err = (e) => say("Could not read this user: " + e.message);
  const all = await getDocs(collection(db, "permanentData")).catch((e) => (err(e), { docs: [] }));
  let name = "";
  all.docs.forEach((d) => { const x = d.data(), det = x.details || {}, e = String(x.baseEmail || det.email || d.id.replace(/-\d+$/, "")).toLowerCase(); if (e === email) { ids.push(d.id); name = det.name || name; } });
  $("mename").textContent = name || email; $("memail").textContent = email; $("meav").textContent = (name || email)[0].toUpperCase();
  need = Math.max(1, ids.length * 3); if (!ids.length) { loaded = need; return render(); }
  ids.forEach((id) => { data[id] = {}; const watch = (p, k) => onSnapshot(collection(db, `permanentData/${id}/backup/${p}/list`), (s) => { data[id][k] = s.docs.map((x) => ({ id: x.id, key: x.id, ...x.data() })); loaded++; render(); }, err); watch("contacts", "c"); watch("activity", "a"); watch("emotions", "e"); });
});
document.addEventListener("click", (ev) => { const t = ev.target.closest("button"); if (!t) return; if (t.id === "logout") return logout(); if (t.id === "back") return shut(); if (t.dataset.k) { open = t.dataset.k; $("pane").hidden = $("scrim").hidden = false; $("pane").scrollTop = 0; render(); } });
$("scrim").addEventListener("click", shut); $("q").addEventListener("input", render);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) shut(); });
