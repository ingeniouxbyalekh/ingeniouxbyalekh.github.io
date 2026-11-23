// Shared look-and-feel helpers: icon set (Lucide-style strokes), avatars, and small chart/markup builders.
// Used by the dashboard and the admin pages. No data logic lives here.
const P = {
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  mobile: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  trend: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};
export const icon = (n, c = "") =>
  `<svg class="i ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100);

// Same name always gets the same colour, so a person is recognisable at a glance.
export const avatarStyle = (s) => {
  let h = 0;
  for (const ch of String(s || "?")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `background:linear-gradient(145deg,hsl(${h} 62% 52%),hsl(${(h + 48) % 360} 60% 34%))`;
};

// Gauge: a ring that fills to the trust percentage. `cls` is the band class (bad/warn/ok/great).
export const gauge = (pct, cls, hasData) =>
  `<div class="gauge ${cls}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="t" cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52" stroke-dasharray="${(pct / 100 * 326.7).toFixed(1)} 326.7"/></svg><b>${hasData ? Math.round(pct) + "<small>%</small>" : "–"}</b></div>`;

// 30-day trend line with a soft area fill and an end marker. Takes percentages (0-100).
export const sparkline = (pts, cls = "") => {
  const W = 300, H = 90, n = pts.length, X = (i) => (i / Math.max(1, n - 1) * W).toFixed(1), Y = (p) => (H - 10 - p * (H - 20) / 100).toFixed(1);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p)}`).join("");
  return `<div class="spark-wrap ${cls}"><svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trust over the last 30 days">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".32"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    ${[25, 50, 75].map((v) => `<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}"/>`).join("")}
    <path class="a" d="${line}L${W},${H}L0,${H}Z" fill="url(#sg)"/><path class="l" d="${line}"/><circle cx="${X(n - 1)}" cy="${Y(pts[n - 1])}" r="4"/></svg>
    <div class="spark-x muted"><span>30 days ago</span><span>Today</span></div></div>`;
};

// Stat tiles: items are [iconName, label, value]. Values must already be safe text.
export const tiles = (items) =>
  `<div class="tiles">${items.map(([ic, l, v]) => `<div class="tile">${icon(ic)}<b>${v}</b><span class="muted">${l}</span></div>`).join("")}</div>`;

// "Most logged" horizontal bars. top = [[name, count], ...]
export const bars = (top) => {
  const tm = Math.max(1, ...top.map((x) => x[1]));
  return top.map(([n, v]) => `<div class="br"><span title="${esc(n)}">${esc(n)}</span><div class="track"><i style="width:${(v / tm * 100).toFixed(0)}%"></i></div><em>${v}</em></div>`).join("");
};

// One history entry. Pass del=true to show the delete button (dashboard only).
export const histRow = (x, del) => {
  const neg = x.points < 0;
  return `<div class="hrow ${neg ? "neg" : "pos"}"><span class="hi">${icon(neg ? "flag" : "smile")}</span>
    <div class="hb"><div class="ht">${esc(x.emotionName)}</div><div class="muted">${new Date(x.timestamp).toLocaleString()}</div></div>
    <b class="pts ${neg ? "bad" : "ok"}">${fmt(x.points)}</b>
    ${del ? `<button class="ghost icon-btn" data-del="${esc(x.id)}" aria-label="Delete this entry" title="Delete">${icon("trash")}</button>` : ""}</div>`;
};

// Three headline cards above the contact list. ts = array of compute() results (nulls allowed).
export const summary = (total, ts) => {
  const have = ts.filter(Boolean), avg = have.length ? Math.round(have.reduce((s, t) => s + t.percent, 0) / have.length) : null;
  const risk = have.filter((t) => t.band[2] === "bad" || t.band[2] === "warn").length;
  return `<div class="sum">${`<span class="ic">${icon("users")}</span>`}<div><b>${total}</b><span>Contacts</span></div></div>
    <div class="sum ${avg == null ? "" : avg < 60 ? "bad" : "ok"}"><span class="ic">${icon("trend")}</span><div><b>${avg == null ? "–" : avg + "%"}</b><span>Average trust</span></div></div>
    <div class="sum ${risk ? "bad" : "ok"}"><span class="ic">${icon(risk ? "alert" : "shield")}</span><div><b>${risk}</b><span>${risk === 1 ? "Needs attention" : "Need attention"}</span></div></div>`;
};

// Fill the static icon slots every page has (logo, search, logout, close).
export const decorate = () => {
  const set = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
  set("logo", icon("shield")); set("searchIc", icon("search")); set("back", icon("x"));
  set("logout", icon("logout") + "<span>Log out</span>");
};

// Right-hand panel when nobody is selected yet.
export const emptyDetail = () =>
  `<div class="dempty"><span class="ic">${icon("users")}</span><b>Select a contact</b><span>Pick someone from the list to see their trust score, trends and history.</span></div>`;

// Header of the detail panel. The back button only shows on small screens.
export const dhead = (c, bandHtml = "") =>
  `<div class="dhead"><button id="back" class="ghost only-m">${icon("back")}<span>Contacts</span></button>
    <div class="av lg" style="${avatarStyle(c.name)}">${esc((c.name || "?")[0].toUpperCase())}</div>
    <div class="dtitle"><h2>${esc(c.name)}</h2><div class="muted">${icon("phone")}${esc(c.phone)}</div></div>${bandHtml}</div>`;
