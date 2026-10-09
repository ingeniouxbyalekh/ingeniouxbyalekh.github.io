/* =====================================================================
   INGENIOUX Disclosure — script.js
   Edit everything on the home page from here: video, tweet, headlines and articles.
   (Only the poll is dynamic: it is created in /Admin and handled by live.js.)
   ===================================================================== */

/* ============================ HOME PAGE CONTENT (edit here) ============================ */

// YouTube video shown in the "Video Briefing" tile.
// url   : any YouTube link (watch?v=..., youtu.be/..., shorts/...). Leave "" to show "No video briefing yet."
// title : text under the thumbnail. Leave "" to fetch it from YouTube automatically.
const VIDEO = {
  url: "https://www.youtube.com/watch?v=MGRTpIyJRIk",
  title: ""
};

// X / Twitter post shown in the "Live Update" tile.
// url: https://x.com/username/status/1234567890   Leave "" to show "No live update yet."
const TWEET = {
  url: ""
};

// Top Headlines list (top to bottom). link is optional: "" makes the headline plain text.
// Leave the list empty to show "No headlines available."
const HEADLINES = [
  // India
  { 
    text: "Supreme Court Asks Government to Reconsider Metro and Train Restrictions in Delhi Amid Protests", 
    link: "https://www.thehindu.com/news/national/cec-gyanesh-kumar-controversy-live-updates-india-bloc-congress-jantar-mantar-cjp-protest-live-updates-october-9-2026/article71562437.ece" 
  },
  { 
    text: "Centre Caps Trade Margin at 30% on Non-Scheduled Cancer Drugs to Lower Treatment Costs", 
    link: "https://ommcomnews.com/india-news/govt-caps-margin-at-30-pc-of-mrp-on-non-scheduled-cancer-drugs" 
  },
  { 
    text: "Counting Underway for Crucial Bypolls Across Five Assembly Seats and One Lok Sabha Constituency", 
    link: "https://www.thehindu.com/news/national/assembly-lok-sabha-bypoll-results-live-updates-october-9-2026/article71561224.ece" 
  },
  { 
    text: "DoT Rejects Allegations of Favoritism as SpaceX's Starlink Authorization Faces Scrutiny", 
    link: "https://www.thehindu.com/news/national/morning-digest-october-9-2026/article71561224.ece" 
  },

  // Odisha
  { 
    text: "ED Raids 10 Premises in Odisha and Bengal Over Sub-Inspector Recruitment Paper Leak", 
    link: "https://sambadenglish.com/ed-raids-10-premises-in-odisha-west-bengal-over-odisha-si-recruitment-paper-leak" 
  },
  { 
    text: "Campuses Across Odisha Gear Up as Nomination Filing for Student Union Elections Commences", 
    link: "https://ommcomnews.com/odisha-news/campuses-gear-up-as-nomination-filing-for-student-union-polls-to-begin-today" 
  }
];

/* ========================== END OF HOME PAGE CONTENT ========================== */

/* ============================ ARTICLES ============================ */

// Articles. Order matters: 1st = big banner, next 5 = Top Headlines,
// next 6 = Featured Articles. (1 + 5 + 6 = 12; extras only show on the Articles page.)
// category must be one of: World, India, Odisha (used by the Articles page filter)
// image: "" shows a coloured letter tile; put an image URL to show a photo.
// link: "#" is a placeholder — replace it with the real URL for each article.
const posts = [
  /* 1 — BIG BANNER */
  {
    category: "World", date: "05/10/2026",
    image: "https://picsum.photos/seed/disclosure-lead/1200/700",
    title: "Reading the Shifting Balance of Power in the Indo-Pacific",
    body: `The Indo-Pacific has become the central stage of twenty-first century strategy. Trade routes, undersea cables and semiconductor supply chains all converge on a region where the interests of several major powers overlap.\n\nFor policymakers, the challenge is no longer choosing a single bloc but managing several partnerships at once. Flexible, issue-based coalitions are replacing the rigid alliances of the previous century.\n\nThe coming years will test whether regional institutions can absorb these pressures. Much will depend on whether smaller states are given a real voice, or are treated only as terrain in a larger contest.`,
    link: "https://ingenioux.in/Disclosure/Articles/Reading-the-Shifting-Balance-of-Power-in-the-Indo-Pacific.html"
  },

  /* 2–6 — TOP HEADLINES */
  {
    category: "World", date: "04/10/2026",
    image: "https://picsum.photos/seed/disclosure-h1/800/450",
    title: "India's Strategic Autonomy in a Multipolar World",
    body: `Strategic autonomy has long been a guiding idea in Indian foreign policy, but its meaning is shifting. In a multipolar order, it now means keeping options open rather than staying aloof.\n\nNew Delhi is deepening ties with partners across several groupings while protecting its own decision-making space. That balancing act is delicate and carries real costs.\n\nThe test will be whether autonomy can be turned into leverage, giving India a stronger hand in rule-making rather than merely avoiding entanglement.`,
    link: "#"
  },
  {
    category: "India", date: "03/10/2026",
    image: "https://picsum.photos/seed/disclosure-h2/800/450",
    title: "Supply Chains, Sanctions and the New Trade Map",
    body: `Global trade is being redrawn by security concerns as much as by cost. Firms that once optimised only for price now weigh political risk in every sourcing decision.\n\nSanctions, export controls and industrial subsidies are reshaping where goods are made and who can buy critical technology.\n\nThe result is a more fragmented but also more diversified trading system, with new winners among countries that position themselves as trusted intermediaries.`,
    link: "#"
  },
  {
    category: "India", date: "02/10/2026",
    image: "https://picsum.photos/seed/disclosure-h3/800/450",
    title: "Maritime Security and the Future of Naval Doctrine",
    body: `Navies are adapting to a world of long-range missiles, uncrewed vessels and contested sea lanes. Traditional surface fleets must now operate alongside swarms of cheaper autonomous systems.\n\nThis shift changes how states think about deterrence at sea, favouring distributed operations over a few high-value platforms.\n\nPorts, chokepoints and undersea infrastructure are becoming just as important as warships themselves.`,
    link: "#"
  },
  {
    category: "World", date: "01/10/2026",
    image: "https://picsum.photos/seed/disclosure-h4/800/450",
    title: "Energy Corridors and the Politics of Pipelines",
    body: `Energy infrastructure has always carried political weight, and the transition to cleaner fuels adds new layers. Pipelines, grids and shipping lanes decide who depends on whom.\n\nCountries that sit on transit routes gain bargaining power, while importers work to diversify suppliers.\n\nThe move toward renewables will not remove geopolitics from energy; it will simply move it to minerals, batteries and technology.`,
    link: "#"
  },
  {
    category: "World", date: "30/09/2026",
    image: "https://picsum.photos/seed/disclosure-h5/800/450",
    title: "Multilateral Forums and the Limits of Consensus",
    body: `International institutions were built for a different distribution of power. Today they struggle to reach agreement when members hold sharply different priorities.\n\nSmaller, purpose-built groupings are filling the gap, moving faster on climate, technology and health.\n\nWhether these new formats strengthen the wider system or weaken it remains an open question for diplomats.`,
    link: "#"
  },

  /* 7–12 — FEATURED ARTICLES */
  {
    category: "India", date: "29/09/2026",
    image: "https://picsum.photos/seed/disclosure-f1/800/450",
    title: "Digital Currencies and the Race for Monetary Influence",
    body: `Central banks around the world are experimenting with digital versions of their currencies. The motives range from payment efficiency to financial inclusion and monetary sovereignty.\n\nCross-border use is where the stakes are highest, since the design of these systems could shift the balance of influence in global finance.\n\nPrivacy, interoperability and trust will determine which models gain wide acceptance.`,
    link: "#"
  },
  {
    category: "India", date: "28/09/2026",
    image: "https://picsum.photos/seed/disclosure-f2/800/450",
    title: "Drones, Doctrine and the Changing Face of Warfare",
    body: `Low-cost drones have changed the economics of conflict, allowing smaller forces to challenge far better-equipped opponents.\n\nMilitaries are now rethinking procurement, training and air defence to cope with large numbers of cheap, expendable systems.\n\nThe broader lesson is that adaptability and production capacity may matter as much as technological superiority.`,
    link: "#"
  },
  {
    category: "Odisha", date: "27/09/2026",
    image: "https://picsum.photos/seed/disclosure-f3/800/450",
    title: "Semiconductors: The Quiet Backbone of National Power",
    body: `Advanced chips power everything from smartphones to missile guidance, making their supply a matter of national security.\n\nGovernments are investing heavily in domestic fabrication while building partnerships to share risk.\n\nBecause no single country controls the entire chain, cooperation and competition will continue to run side by side.`,
    link: "#"
  },
  {
    category: "Odisha", date: "26/09/2026",
    image: "https://picsum.photos/seed/disclosure-f4/800/450",
    title: "Climate Diplomacy Moves From Pledges to Delivery",
    body: `After years of ambitious targets, attention is turning to implementation. Financing, technology transfer and fair burden-sharing dominate the negotiating table.\n\nDeveloping economies argue that they need predictable support to leapfrog fossil-fuel growth.\n\nCredible delivery, rather than new headline promises, will decide whether trust in the process can be rebuilt.`,
    link: "#"
  },
  {
    category: "World", date: "25/09/2026",
    image: "https://picsum.photos/seed/disclosure-f5/800/450",
    title: "The Arctic: A New Frontier for Great-Power Competition",
    body: `Melting ice is opening new shipping lanes and access to resources in the high north. Interest from states inside and outside the region is rising.\n\nExisting cooperative frameworks face pressure as security concerns spill into what was once a low-tension area.\n\nManaging this frontier will require balancing economic opportunity, environmental protection and strategic caution.`,
    link: "#"
  },
  {
    category: "World", date: "24/09/2026",
    image: "https://picsum.photos/seed/disclosure-f6/800/450",
    title: "Soft Power in the Age of Streaming and Social Media",
    body: `Culture, education and digital platforms now shape how countries are seen abroad. Films, music and online communities can build influence more quietly than any treaty.\n\nStates are investing in public diplomacy, scholarships and creative industries to extend their reach.\n\nYet credibility is fragile: audiences quickly detect the gap between a country's image and its actions.`,
    link: "#"
  }
];

/* =========================== END OF ARTICLES =========================== */

const $ = id => document.getElementById(id);
let cat = "All", V = "";

/* ---------- helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dt = p => p.date || "Recent";
const rt = p => Math.max(1, Math.round((p.body || "").split(/\s+/).length / 200)) + " min read";
const slugOf = p => { const m = /\/Articles\/([^/?#]+?)(?:\.html?)?(?:[?#].*)?$/i.exec(p.link || ""); return m ? decodeURIComponent(m[1]) : null; };
const vw = p => { const n = (window.ARTICLE_VIEWS || {})[slugOf(p)]; return n === undefined ? "" : ` · ${n === 1 ? "1 view" : n.toLocaleString("en-IN") + " views"}`; };
window.addEventListener("articleviews", () => draw());
const ex = (p, n) => esc((p.body || "").slice(0, n)) + "…";

/* ---------- routing (Home / Articles) ---------- */
const tiles = ["videos", "poll", "tweets"];
function route() {
  if (V && !location.hash) return;   // a "#" link was clicked: stay on the current page
  const h = location.hash.slice(1);
  V = h === "articles" ? "articles" : "home";
  document.querySelectorAll("[data-v]").forEach(e => e.hidden = !e.dataset.v.split(" ").includes(V));
  document.querySelectorAll("#links a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + (tiles.includes(h) ? h : V)));
  tiles.includes(h) ? $(h).scrollIntoView() : window.scrollTo(0, 0);
  draw();
}
window.addEventListener("hashchange", route);

/* ---------- Sign In placeholder ---------- */
// Sign In button is handled by auth-nav.js (links to login.html)

/* ---------- article cards ---------- */
const artCard = p => `
  <a class="art" href="${esc(p.link || "#")}">
    <div class="thumb" style="${p.image ? `background-image:url('${esc(p.image)}')` : `background: #1E293B`}">${p.image ? "" : esc((p.category || "A")[0])}</div>
    <div class="in">
      <h3>${esc(p.title)}</h3>
      <p>${ex(p, 130)}</p>
      <div class="meta">${dt(p)} · ${rt(p)}${vw(p)}</div>
    </div>
  </a>`;

/* ---------- main render ---------- */
function draw() {
  const arts = posts;

  // Hero Article
  const leadArt = arts[0];
  if (leadArt) {
    $("lead").href = leadArt.link || "#";
    $("leadBg").style.backgroundImage = leadArt.image ? `url('${esc(leadArt.image)}')` : "";
    $("leadContent").innerHTML = `
      <h2>${esc(leadArt.title)}</h2>
      <p>${ex(leadArt, 220)}</p>
      <div class="meta">${dt(leadArt)} · ${rt(leadArt)}${vw(leadArt)}</div>
      <span class="btn">Read Investigation →</span>`;
  } else {
    $("leadBg").style.backgroundImage = "";
    $("leadContent").innerHTML = `<h2>Intelligence & Global Analysis</h2><p>Add articles in the posts list inside script.js.</p>`;
  }

  // Home Featured Grid (articles 7–12)
  $("homeArts").innerHTML = arts.slice(6, 12).map(artCard).join("") || '<div class="empty">More articles coming soon.</div>';

  // Articles page: search + category filter
  const s = $("search").value.toLowerCase();
  const cats = ["All", "World", "India", "Odisha"];   // fixed filter list
  $("cats").innerHTML = cats.map(c => `<button class="${c === cat ? "on" : "alt"}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  $("cats").querySelectorAll("button").forEach(b => b.onclick = () => { cat = b.dataset.c; draw(); });

  const filtered = arts.filter(p => (cat === "All" || p.category === cat) && (p.title + p.body).toLowerCase().includes(s));
  $("artAll").innerHTML = filtered.map(artCard).join("") || '<div class="empty">No matching articles found.</div>';
}

$("search").oninput = draw;

/* ---------- static home tiles (video / tweet / headlines) ---------- */
const emptyMsg = t => `<div class="empty">${t}</div>`;
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";

function renderHeadlines() {
  $("latest").innerHTML = HEADLINES.filter(h => h && h.text).map(h => {
    const l = safeUrl(h.link);
    return l ? `<a class="li" href="${esc(l)}" target="_blank" rel="noopener"><b>${esc(h.text)}</b></a>`
             : `<div class="li" style="cursor:default"><b>${esc(h.text)}</b></div>`;
  }).join("") || emptyMsg("No headlines available.");
}

const ytId = u => (String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/) || [])[1];

async function renderVideo() {
  const id = ytId(VIDEO.url);
  if (!id) { $("tVideo").innerHTML = emptyMsg("No suggested video available."); return; }
  let title = (VIDEO.title || "").trim();
  if (!title) {
    try { title = (await (await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(VIDEO.url))).json()).title; } catch {}
  }
  $("tVideo").innerHTML = `<a class="yt" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${esc(id)}"><div class="th"><img src="https://img.youtube.com/vi/${esc(id)}/hqdefault.jpg" alt=""></div><b>${esc(title || "Video briefing")}</b></a>`;
}

function renderTweet() {
  const u = safeUrl(TWEET.url);
  if (!/^https?:\/\/(www\.)?(twitter|x)\.com\/\w+\/status\/\d+/.test(u)) { $("tTweet").innerHTML = emptyMsg("No live update yet."); return; }
  $("tTweet").innerHTML = `<blockquote class="twitter-tweet" data-conversation="none"><a href="${esc(u.replace(/^(https?:\/\/)(www\.)?x\.com/i, "$1twitter.com"))}"></a></blockquote>`;
  let tries = 0;
  (function load() { if (window.twttr?.widgets) twttr.widgets.load($("tTweet")); else if (tries++ < 40) setTimeout(load, 250); })();
}

/* ---------- start ---------- */
$("today").textContent = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());   // today in IST, DD/MM/YYYY
renderHeadlines(); renderVideo(); renderTweet();
route();