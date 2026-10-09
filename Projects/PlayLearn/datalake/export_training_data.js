#!/usr/bin/env node
/**
 * Export the PlayLearn data lake from Firestore to JSON Lines files that
 * are ready for analysis / AI training.
 *
 * Setup (once):
 *   npm i firebase-admin
 *   Firebase console → Project settings → Service accounts → Generate new
 *   private key → save as serviceAccount.json  (keep it SECRET, never commit it)
 *
 * Usage:
 *   node export_training_data.js --key serviceAccount.json --out ./export
 *   node export_training_data.js --key serviceAccount.json --since 2026-10-01 --sequences
 *   node export_training_data.js --key serviceAccount.json --anonymize
 *
 * Options:
 *   --key <file>       service-account JSON (required)
 *   --out <dir>        output folder (default ./export)
 *   --since <date>     only records uploaded on/after this date (YYYY-MM-DD)
 *   --anonymize        replace emails / userKeys / names with stable hashes
 *   --sequences        also write sessions.jsonl: ONE line per browsing session,
 *                      all its events + database writes in time order
 *                      (the natural shape for sequence / next-action models)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("firebase-admin");

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true); };
const keyFile = opt("key"), outDir = opt("out", "./export"), since = opt("since"), anonymize = !!opt("anonymize"), sequences = !!opt("sequences");
if (!keyFile || keyFile === true) { console.error("Missing --key serviceAccount.json"); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyFile))) });
const db = admin.firestore();
fs.mkdirSync(outDir, { recursive: true });

const COLLECTIONS = ["ai_sessions", "ai_events", "ai_db_mutations", "ai_db_reads"];
const PII_KEYS = /^(email|name|phone|regNo|username|userKey|fromName)$/i;
const hash = (v) => "u_" + crypto.createHash("sha256").update("playlearn|" + String(v).toLowerCase()).digest("hex").slice(0, 16);

function plain(v, key) {
  if (v && typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map((x) => plain(x));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k], k); return o; }
  if (anonymize && key && PII_KEYS.test(key) && v) return hash(v);
  if (anonymize && typeof v === "string" && v.includes("@")) return v.replace(/[^\s@",]+@[^\s@",]+\.[^\s@",]+/g, (m) => hash(m)); // emails inside free text
  return v;
}

async function dump(col) {
  const file = path.join(outDir, col + ".jsonl");
  const out = fs.createWriteStream(file);
  let last = null, n = 0;
  const startTs = since ? admin.firestore.Timestamp.fromDate(new Date(since)) : null;
  for (;;) {
    let q = db.collection(col).orderBy("uploadedAt").limit(1000);
    if (startTs) q = q.where("uploadedAt", ">=", startTs);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) { out.write(JSON.stringify({ _id: doc.id, ...plain(doc.data()) }) + "\n"); n++; }
    last = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r${col}: ${n}`);
  }
  await new Promise((r) => out.end(r));
  console.log(`\r${col}: ${n} records → ${file}`);
  return file;
}

async function buildSequences() {
  const sessions = new Map();
  for (const col of ["ai_events", "ai_db_mutations"]) {
    const rl = require("readline").createInterface({ input: fs.createReadStream(path.join(outDir, col + ".jsonl")) });
    for await (const line of rl) {
      if (!line) continue;
      const r = JSON.parse(line);
      const s = sessions.get(r.sessionId) || { sessionId: r.sessionId, visitorId: r.visitorId, userKey: null, steps: [] };
      if (r.userKey) s.userKey = r.userKey;
      s.steps.push({ t: r.clientTs, seq: r.seq, kind: col === "ai_events" ? "event" : "db_write", type: r.type, page: r.page && r.page.name, area: r.page && r.page.area, data: r.data !== undefined ? r.data : { op: r.op, path: r.path, domain: r.domain, payload: r.payload } });
      sessions.set(r.sessionId, s);
    }
  }
  const out = fs.createWriteStream(path.join(outDir, "sessions.jsonl"));
  for (const s of sessions.values()) { s.steps.sort((a, b) => a.t - b.t || (a.seq || 0) - (b.seq || 0)); out.write(JSON.stringify(s) + "\n"); }
  await new Promise((r) => out.end(r));
  console.log(`sessions.jsonl: ${sessions.size} sessions`);
}

(async () => {
  for (const c of COLLECTIONS) await dump(c);
  if (sequences) await buildSequences();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
