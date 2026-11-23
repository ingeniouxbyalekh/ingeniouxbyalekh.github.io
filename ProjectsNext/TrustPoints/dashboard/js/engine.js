// Same rules as the app's Trust Engine.
const R = "Hurtful actions (Red flags)", G = "Good actions (Green flags)";
export const CAT_OWN = "My own";
export const BUILT_IN = [
  ["Cheated on me",-1],["Left me alone in danger",-.95],["Made me doubt my memory",-.95],["Spread bad lies about me",-.9],
  ["Used my secrets against me",-.9],["Used me for money",-.85],["Made fun of me in public",-.85],["Lied to my face",-.8],
  ["Shamed me for opening up",-.8],["Turned others against me",-.75],["Shouted at me / Called me bad names",-.75],
  ["Rolled their eyes / Sneered at me",-.7],["Hid the truth from me",-.65],["Made me feel guilty",-.6],["Got jealous of my win",-.6],
  ["Gave me the silent treatment",-.55],["Said I was \"too sensitive\"",-.5],["Got angry when corrected",-.4]
].map(([name, points]) => ({ name, points, category: R })).concat([
  ["Showed up when I needed help",.85],["Told the truth even when it hurt",.85],["Stood up for me behind my back",.8],
  ["Was open even under pressure",.75],["Said sorry and changed their habits",.65],["Admitted a mistake on their own",.6],
  ["Respected my \"No\"",.6],["Listened without judging me",.55],["Shared their deep fears",.55],["Helped without being asked",.5],
  ["Celebrated my success",.45],["Kept their daily word",.35],["Made me smile or laugh",.25]
].map(([name, points]) => ({ name, points, category: G })));
export const CATS = [R, G, CAT_OWN];
const DAY = 864e5, BAD = 2.5, CAP = .8, ALPHA = .15, MAJOR = -.9, SAFE_PCT = 35, SAFE_DAYS = 30;
export const bandFor = (p) => p < 36 ? ["Not safe", "Trust is very low. Be careful.", "bad"]
  : p < 60 ? ["Shaky", "Trust is weak and can break easily.", "warn"]
  : p < 85 ? ["Steady", "Trust is good and fairly reliable.", "ok"]
  : ["Very high trust", "Trust is strong.", "great"];
const dayIdx = (t) => Math.floor((t - new Date(t).getTimezoneOffset() * 6e4) / DAY);
export function compute(entries, base = 0, asOf = Date.now()) {
  const used = entries.filter((e) => e.timestamp <= asOf);
  const start = Math.max(-1, Math.min(1, base / 10));
  if (!used.length && start === 0) return null;
  let t = start;
  if (used.length) {
    const by = new Map();
    for (const e of used) { const d = dayIdx(e.timestamp); (by.get(d) || by.set(d, []).get(d)).push(e.points); }
    for (let d = Math.min(...by.keys()); d <= dayIdx(asOf); d++) {
      const w = by.get(d) || [];
      const s = Math.min(CAP, w.filter((x) => x > 0).reduce((a, b) => a + b, 0)) + BAD * w.filter((x) => x < 0).reduce((a, b) => a + b, 0);
      t = ALPHA * s + (1 - ALPHA) * t;
    }
  }
  let percent = Math.max(0, Math.min(100, 50 + t * 50));
  const safety = used.some((e) => e.points <= MAJOR && e.timestamp >= asOf - SAFE_DAYS * DAY);
  if (safety && percent > SAFE_PCT) percent = SAFE_PCT;
  return { percent, band: bandFor(percent), safety };
}
