/**
 * PlayLearn Shop — "Install app" prompt
 * ---------------------------------------------------------------
 * Chrome/Android/desktop Edge fire `beforeinstallprompt` when the
 * PWA criteria (manifest + service worker + https) are met. We stash
 * that event and reveal a real "Install app" button; clicking it
 * calls prompt() and shows the OS-native install dialog.
 *
 * iOS Safari never fires that event — Apple has no auto-install API.
 * There, the only path is Share -> "Add to Home Screen", so instead
 * we show a small instruction banner the first time an iPhone/iPad
 * visitor lands here (dismiss is remembered in localStorage so it
 * doesn't nag every visit).
 * ---------------------------------------------------------------
 */

(function () {
  const STORAGE_KEY = "PlayLearn_install_dismissed_v1";

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true // iOS Safari
    );
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  if (isStandalone()) return; // already installed / running as an app — nothing to do

  // Register the service worker (required for installability on Android/Chrome)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed:", err));
    });
  }

  function buildBanner(innerHTML) {
    const banner = document.createElement("div");
    banner.id = "install-banner";
    banner.className = "install-banner";
    banner.innerHTML = `
      <div class="install-banner-inner">
        <img src="icons/icon-96.png" alt="" class="install-banner-icon" />
        <div class="install-banner-text">${innerHTML}</div>
        <button type="button" class="install-banner-close" aria-label="Dismiss">✕</button>
      </div>`;
    document.body.appendChild(banner);
    banner.querySelector(".install-banner-close").addEventListener("click", () => {
      banner.remove();
      localStorage.setItem(STORAGE_KEY, "1");
    });
    return banner;
  }

  if (localStorage.getItem(STORAGE_KEY) === "1") return;

  // --- Android / desktop Chrome & Edge: real install prompt ---
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const banner = buildBanner(`
      <strong>Install PlayLearn</strong>
      <span>Add it to your home screen for quick, app-like access.</span>
    `);
    const installBtn = document.createElement("button");
    installBtn.type = "button";
    installBtn.className = "btn btn-primary install-banner-btn";
    installBtn.textContent = "Install";
    banner.querySelector(".install-banner-inner").insertBefore(
      installBtn,
      banner.querySelector(".install-banner-close")
    );

    installBtn.addEventListener("click", async () => {
      banner.remove();
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(STORAGE_KEY, "1");
    const banner = document.getElementById("install-banner");
    if (banner) banner.remove();
  });

  // --- iOS Safari: no auto-prompt exists, show manual instructions ---
  if (isIOS() && !window.MSStream) {
    buildBanner(`
      <strong>Install PlayLearn</strong>
      <span>Tap <strong>Share</strong> <span aria-hidden="true">⬆️</span> then <strong>"Add to Home Screen"</strong>.</span>
    `);
  }
})();
