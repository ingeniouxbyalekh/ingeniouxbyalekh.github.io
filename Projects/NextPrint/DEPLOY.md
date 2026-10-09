# Deploying the Cloudinary delete function

This makes "Cancel" and "Mark as printed" in `print.html` actually delete
the uploaded files from Cloudinary, reliably — no more "delete link may
have expired" alerts. It works by adding one small Cloud Function that
holds your Cloudinary API key/secret (which must never be put in
`config.js`, since that file is visible to anyone who opens the site).

You only need to do this once. It takes about 10 minutes.

## 1. Get your Cloudinary API key and secret

Log in to https://cloudinary.com/console — your **API Key** and
**API Secret** are on the dashboard, under "API Environment variable" /
"Account Details". Keep these private (unlike the cloud name, which is
already public in `config.js`).

## 2. Install the Firebase CLI (if you don't have it)

```
npm install -g firebase-tools
firebase login
```

## 3. From inside this project folder (the one with `firebase.json`)

Point the CLI at your existing Firebase project:

```
firebase use nextprint-1d319
```

(That's the `projectId` already in your `config.js`. If you use a
different alias, run `firebase use --add` instead and pick it from the
list.)

## 4. Store your Cloudinary key/secret as secrets

These are stored in Google Cloud Secret Manager, not in your code, and
only this function can read them:

```
firebase functions:secrets:set CLOUDINARY_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
```

Paste the corresponding value from step 1 when each one prompts you.

## 5. Install dependencies and deploy

```
cd functions
npm install
cd ..
firebase deploy --only functions
```

This requires your Firebase project to be on the **Blaze (pay-as-you-go)
plan** — Cloud Functions that make outbound network calls (like calling
Cloudinary) need it. In practice this function's usage is tiny and will
almost certainly stay within Firebase's free monthly quota, so you likely
won't be charged anything.

## 6. Copy the function's URL into config.js

When the deploy finishes, it prints a URL that looks like:

```
https://deletecloudinaryfile-xxxxxxxxxx-uc.a.run.app
```

Paste that into `config.js`:

```js
cloudinary: {
  cloudName: "qhusfwy8",
  uploadPreset: "PrintNext",
  deleteFunctionUrl: "https://deletecloudinaryfile-xxxxxxxxxx-uc.a.run.app",
},
```

That's it — from now on, cancelling or marking a request as printed will
delete its files from Cloudinary for real.

## Note on requests already in your queue

Only files uploaded **after** this update carries their Cloudinary
`public_id`, which this function needs. Any print requests already
sitting in your dashboard before you made this change only have the old
short-lived delete token, so they'll still show the "could not be
auto-removed" message if it's been more than ~10 minutes since upload —
you'll need to clear those specific files manually in the Cloudinary
console. Everything from here on will delete cleanly.
