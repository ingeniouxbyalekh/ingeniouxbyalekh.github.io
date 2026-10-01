// Dark/light theme. Saved in localStorage; defaults to the device setting. Load in <head> to avoid a flash.
(function () {
  const K = "OUTR_theme", root = document.documentElement;
  const get = () => { try { return localStorage.getItem(K); } catch (e) { return null; } };
  const eff = () => get() || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const apply = () => {
    root.dataset.theme = eff();
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => (b.textContent = eff() === "dark" ? "Light mode" : "Dark mode"));
  };
  window.Theme = { toggle() { try { localStorage.setItem(K, eff() === "dark" ? "light" : "dark"); } catch (e) {} apply(); } };
  apply();
  document.addEventListener("DOMContentLoaded", () => { document.querySelectorAll("[data-theme-toggle]").forEach((b) => (b.onclick = Theme.toggle)); apply(); });
})();
