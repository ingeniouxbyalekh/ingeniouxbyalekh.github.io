/* ============================================================
   NextPrint — deleteCloudinaryFile Cloud Function
   ------------------------------------------------------------
   Deletes a Cloudinary file by its permanent public_id, using a
   signature computed from your Cloudinary API key + secret.
   Those two values are kept in Secret Manager (see DEPLOY.md)
   and are never sent to the browser — only this server-side
   function ever sees them, so deletion works no matter how much
   time has passed since the file was uploaded (unlike the
   client-side delete-token, which Cloudinary invalidates after
   about 10 minutes).

   Called from print.html as:
     POST <this function's URL>
     { "publicId": "...", "resourceType": "image" | "video" | "raw" }
   ============================================================ */

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");

// Your Cloudinary cloud name isn't sensitive — it's already public in
// config.js on the site itself. Change this if your cloud name differs.
const CLOUD_NAME = "qhusfwy8";

const cloudinaryApiKey = defineSecret("CLOUDINARY_API_KEY");
const cloudinaryApiSecret = defineSecret("CLOUDINARY_API_SECRET");

exports.deleteCloudinaryFile = onRequest(
  { secrets: [cloudinaryApiKey, cloudinaryApiSecret], cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Use POST" });
      return;
    }

    const { publicId, resourceType } = req.body || {};
    if (!publicId || typeof publicId !== "string") {
      res.status(400).json({ ok: false, error: "publicId is required" });
      return;
    }

    const apiKey = cloudinaryApiKey.value();
    const apiSecret = cloudinaryApiSecret.value();
    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary's signing rule: sort the params you're sending
    // (alphabetically, excluding api_key/signature/file), join as
    // key=value&key=value, append the api secret, then SHA-1 it.
    const signature = crypto
      .createHash("sha1")
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");

    const type = ["image", "video", "raw"].includes(resourceType) ? resourceType : "image";
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${type}/destroy`;

    const body = new URLSearchParams();
    body.append("public_id", publicId);
    body.append("timestamp", String(timestamp));
    body.append("api_key", apiKey);
    body.append("signature", signature);

    try {
      const cloudRes = await fetch(url, { method: "POST", body });
      const data = await cloudRes.json();
      res.status(200).json({ ok: data.result === "ok", result: data.result || data });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  }
);
