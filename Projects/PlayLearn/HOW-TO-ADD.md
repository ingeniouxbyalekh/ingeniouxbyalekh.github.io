# Making PlayLearn installable — what to add

## 1. Upload these files
Put everything in this folder (`icons/`, `manifest.json`, `sw.js`,
`install.js`, `install-banner.css`) into the **same folder as
`index.html`** on your server — i.e.
`https://ingenioux.in/Projects/PlayLearn/`.

## 2. Add these lines inside `index.html`'s `<head>`
Right after your existing `<link rel="stylesheet" href="style.css" />` line:

```html
<link rel="manifest" href="manifest.json" />
<meta name="theme-color" content="#0b162c" />
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="icons/favicon-16.png" />
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="PlayLearn" />
<link rel="stylesheet" href="install-banner.css" />
```

## 3. Add this line just before `</body>`
(after your existing `<script src="auth.js"></script>` line is fine)

```html
<script src="install.js"></script>
```

That's the whole change for `index.html`.

## 4. (Recommended) Do the same on every other page
`store.html`, `product.html`, `login.html`, `profile.html`, etc. —
so a visitor who lands on any page (not just index) also gets offered
the install banner, and `display-mode: standalone` works no matter
which page they open the app back up on. Same three snippets, same
paste locations, on each file.

## What happens after this is live

- **Android / Chrome / Edge (desktop or mobile):** the browser
  detects the manifest + service worker and automatically shows an
  "Install app" icon in the address bar. On top of that,
  `install.js` shows a small banner with an **Install** button — tapping
  it pops the native "Add PlayLearn to Home screen?" dialog, and it
  lands as a real app icon/shortcut with your logo.
- **iPhone / iPad (Safari):** Apple doesn't allow any browser to
  trigger this automatically. `install.js` instead shows a banner
  saying *"Tap Share, then Add to Home Screen"* — the standard iOS
  way to create a home-screen app icon. There's no way around this
  restriction; it's an Apple platform limitation, not something fixable
  in code.
- The banner is dismissible and remembers the dismissal
  (`localStorage`), so it won't nag returning visitors who already
  said no or already installed.
- Once installed, opening the icon launches PlayLearn in its own
  standalone window (no browser address bar), like a native app.

## Notes
- This all requires **HTTPS** — if `ingenioux.in` is already served
  over `https://`, you're set (Chrome refuses to register service
  workers on plain `http://`, `localhost` is the only exception).
- The icons were generated from your `logo.png`, in 9 sizes plus
  "maskable" versions (extra padding so Android's adaptive-icon
  shapes — circle, squircle, etc. — don't crop your logo) and a
  flattened `apple-touch-icon.png` for iOS (which doesn't support
  transparency well).
- If you ever move the shop to a different folder/domain, update
  `start_url` and `scope` in `manifest.json` to match.
