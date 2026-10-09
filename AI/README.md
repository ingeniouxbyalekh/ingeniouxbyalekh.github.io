# INGENIOUX · AI Data Lab
Firebase project: **ingenioux-ai** (SDK 13.0.0)

- index.html — dashboard page (open at /AI/)
- css/style.css, js/app.js — styles and logic
- firestore.rules — paste into Firebase Console > Firestore > Rules > Publish (analytics data, read-only for this page)
- database.rules.json — paste into Firebase Console > Realtime Database > Rules > Publish (admin login only)
- Data is written by /datalake.js (site root), which must stay at the root and be included on every page you want tracked.

## Admin login = Realtime Database only
- Create the Realtime Database in the ingenioux-ai project (Build > Realtime Database > Create).
- `databaseURL` in js/app.js is set to the asia-southeast1 URL: https://ingenioux-ai-default-rtdb.asia-southeast1.firebasedatabase.app
- First visit: create the dashboard password (stored hashed in `ai_config/access`).
- Single login: if the dashboard is already open on another device, an "Another login found" dialog (Cancel / OK) appears. OK logs the other device out (`ai_config/session`).
- Brute-force guard: 5 wrong passwords block that browser/device for 24 hours (localStorage keys IX_AI_FAILS / IX_AI_BLOCK).

## Dashboard
Tabs include Journeys, Cohorts, AI dataset (field coverage + CSV/JSONL exports).
Filters: Area = Home / Projects / Disclosure / Blogs / Store (Home = site root). Device = Mobile / Desktop / Tablet.

## AI API key sync (all devices)
- The key is saved encrypted (AES-GCM, key derived from the dashboard password) in Realtime Database at `ai_config/ai`, so any device that logs in with the password gets it automatically.
- Publish the updated database.rules.json (adds the `ai` node).
- A key saved earlier in one browser's localStorage is uploaded automatically the first time that browser logs in after this update. Other devices: log out and back in once.
- Changing the dashboard password re-encrypts the key automatically.
