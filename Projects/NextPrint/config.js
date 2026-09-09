/* ============================================================
   NextPrint — configuration
   Fill in the placeholders below. Nothing else in the code
   needs to change once these are correct.
   ============================================================ */

const CONFIG = {

  // --- Cloudinary (file storage) ---------------------------
  // Already filled in from your account.
  cloudinary: {
    cloudName: "qhusfwy8",
    uploadPreset: "PrintNext",

    // URL of the deleteCloudinaryFile Cloud Function (see the
    // /functions folder + DEPLOY.md). Paste it here after you
    // deploy the function — until then, deletion falls back to
    // the old short-lived delete-token method, which often fails
    // for requests older than ~10 minutes.
    deleteFunctionUrl: "",
  },

  // --- Firebase Realtime Database ----------------------------
  // Get this from: Firebase Console → Project settings (gear icon)
  // → General tab → "Your apps" → Web app → SDK setup and configuration
  // → "Config" option. Paste the whole object below.
  firebase: {
    apiKey: "AIzaSyADLf3ZqDNFHnBinCrFibhTKWcJz5uupsQ",
    authDomain: "nextprint-1d319.firebaseapp.com",
    databaseURL: "https://nextprint-1d319-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "nextprint-1d319",
    storageBucket: "nextprint-1d319.firebasestorage.app",
    messagingSenderId: "705282808710",
    appId: "1:705282808710:web:6abed3d1b04229cccb2a07",
  },

  // --- Payment ---------------------------------------------------
  // Razorpay checkout. "Pay now" opens the Razorpay popup for the
  // estimated amount; "Pay after delivery" saves the request without
  // collecting payment. This is a client-only integration (no backend
  // to create signed orders or verify payments server-side) — fine for
  // a low-stakes print-shop counter flow, but note that payment
  // confirmation is trusted from the browser response only.
  paymentsEnabled: true,
  razorpay: {
    keyId: "rzp_live_TOsCHwGP3tNy9c",
  },

  // --- Pricing (edit these to match your actual rates) --------
  // Amounts are in rupees per page.
  pricing: {
    blackAndWhite: 4,
    color: 7,
    photoPaper: 30,
  },

  // --- Token ---------------------------------------------------
  // Every submitted print request gets a sequential 4-digit token
  // (1001–9999, wrapping back to 1001), which the customer shows at
  // the print desk. This code is also accepted everywhere as a
  // staff override/master code.
  universalOtp: "1234",

  // --- Admin dashboard login -------------------------------------
  // The admin password is no longer set here. The first time
  // anyone opens print.html, they'll be asked to create a password,
  // which is hashed (SHA-256) and stored in the Firebase Realtime
  // Database at adminAuth/passwordHash. From then on, that password
  // is required to log in, and it can be changed from inside the
  // dashboard.
};
