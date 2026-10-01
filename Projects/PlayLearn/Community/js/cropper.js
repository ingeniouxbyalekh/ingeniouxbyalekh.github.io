// Profile-picture crop & edit dialog.
//   Cropper.open(fileOrBlob) -> Promise<Blob | null>   (512x512 JPEG, or null if cancelled)
// Drag to move, pinch / wheel / slider to zoom, rotate, flip, brightness / contrast / saturation.
(function () {
  const OUT = 512;                       // exported size (px)
  const ICON = {
    left: '<svg viewBox="0 0 24 24"><path d="M1 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/></svg>',
    flip: '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M8 7L3 17h5z"/><path d="M16 7l5 10h-5z"/></svg>',
    reset: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
  };

  async function load(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) {}
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { res(img); };
      img.onerror = () => rej(new Error("Couldn't read this image. Try a JPG or PNG."));
      img.src = url;
    });
  }

  function open(file) {
    return new Promise(async (resolve, reject) => {
      let src;
      try { src = await load(file); } catch (e) { reject(e); return; }
      const iw = src.width, ih = src.height;

      const st = { zoom: 1, ox: 0, oy: 0, rot: 0, flip: false, b: 100, c: 100, s: 100 };

      const ov = document.createElement("div");
      ov.className = "overlay crp-ov";
      ov.innerHTML =
        '<div class="card crp" role="dialog" aria-modal="true" aria-label="Crop and edit photo">' +
        '<h2>Crop &amp; edit</h2>' +
        '<p class="muted crp-hint">Drag to move · pinch or use the slider to zoom</p>' +
        '<div class="crp-stage"><canvas class="crp-cv" width="360" height="360"></canvas></div>' +
        '<div class="crp-tools">' +
        '<button type="button" class="crp-ic" data-a="left" aria-label="Rotate left">' + ICON.left + '</button>' +
        '<button type="button" class="crp-ic" data-a="right" aria-label="Rotate right">' + ICON.right + '</button>' +
        '<button type="button" class="crp-ic" data-a="flip" aria-label="Flip horizontally">' + ICON.flip + '</button>' +
        '<button type="button" class="crp-ic" data-a="reset" aria-label="Reset">' + ICON.reset + '</button>' +
        '</div>' +
        '<div class="crp-sl"><label>Zoom<input type="range" data-k="zoom" min="100" max="400" value="100"></label>' +
        '<label>Brightness<input type="range" data-k="b" min="50" max="150" value="100"></label>' +
        '<label>Contrast<input type="range" data-k="c" min="50" max="150" value="100"></label>' +
        '<label>Saturation<input type="range" data-k="s" min="0" max="200" value="100"></label></div>' +
        '<div class="crp-act"><button type="button" class="btn ghost" data-a="cancel">Cancel</button>' +
        '<button type="button" class="btn" data-a="apply">Apply</button></div>' +
        '</div>';
      document.body.append(ov);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const stage = ov.querySelector(".crp-stage");
      const cv = ov.querySelector(".crp-cv");
      const ctx = cv.getContext("2d");

      function clamp() {
        const odd = st.rot % 2 === 1, w = odd ? ih : iw, h = odd ? iw : ih;
        const scale = (1 / Math.min(w, h)) * st.zoom;          // in units of "view size"
        const mx = Math.max(0, (w * scale - 1) / 2), my = Math.max(0, (h * scale - 1) / 2);
        st.ox = Math.min(mx, Math.max(-mx, st.ox));
        st.oy = Math.min(my, Math.max(-my, st.oy));
      }
      function paint(c, size) {
        clamp();
        const scale = (size / Math.min(st.rot % 2 ? ih : iw, st.rot % 2 ? iw : ih)) * st.zoom;
        c.fillStyle = "#fff"; c.fillRect(0, 0, size, size);
        c.save();
        c.translate(size / 2 + st.ox * size, size / 2 + st.oy * size);
        c.scale(st.flip ? -1 : 1, 1);
        c.rotate((st.rot * Math.PI) / 2);
        c.scale(scale, scale);
        c.drawImage(src, -iw / 2, -ih / 2);
        c.restore();
      }
      function render() {
        paint(ctx, cv.width);
        cv.style.filter = `brightness(${st.b}%) contrast(${st.c}%) saturate(${st.s}%)`;
      }
      render();

      // --- drag / pinch / wheel ---
      const ptrs = new Map(); let pinch = 0;
      stage.addEventListener("pointerdown", (e) => {
        stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e);
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
        stage.classList.add("drag");
      });
      stage.addEventListener("pointermove", (e) => {
        if (!ptrs.has(e.pointerId)) return;
        const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, e);
        const r = stage.getBoundingClientRect();
        if (ptrs.size === 1) {
          st.ox += (e.clientX - prev.clientX) / r.width;
          st.oy += (e.clientY - prev.clientY) / r.height;
        } else if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (pinch) setZoom(st.zoom * (d / pinch)); pinch = d;
        }
        render();
      });
      const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) stage.classList.remove("drag"); };
      stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
      stage.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(st.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); render(); }, { passive: false });

      const zoomEl = ov.querySelector('[data-k="zoom"]');
      function setZoom(z) { st.zoom = Math.min(4, Math.max(1, z)); zoomEl.value = Math.round(st.zoom * 100); }

      ov.querySelectorAll("input[type=range]").forEach((el) => {
        el.addEventListener("input", () => {
          const v = +el.value, k = el.dataset.k;
          if (k === "zoom") setZoom(v / 100); else st[k] = v;
          render();
        });
      });

      // --- buttons ---
      function done(blob) {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = prevOverflow;
        ov.remove(); if (src.close) src.close();
        resolve(blob);
      }
      function onKey(e) { if (e.key === "Escape") done(null); }
      document.addEventListener("keydown", onKey);

      ov.addEventListener("click", (e) => {
        const a = e.target.closest("[data-a]"); if (!a) return;
        const act = a.dataset.a;
        if (act === "left") { st.rot = (st.rot + 3) % 4; st.ox = st.oy = 0; }
        else if (act === "right") { st.rot = (st.rot + 1) % 4; st.ox = st.oy = 0; }
        else if (act === "flip") st.flip = !st.flip;
        else if (act === "reset") {
          Object.assign(st, { zoom: 1, ox: 0, oy: 0, rot: 0, flip: false, b: 100, c: 100, s: 100 });
          ov.querySelectorAll("input[type=range]").forEach((el) => (el.value = 100));
        }
        else if (act === "cancel") return done(null);
        else if (act === "apply") return exportBlob();
        render();
      });

      function exportBlob() {
        const out = document.createElement("canvas"); out.width = out.height = OUT;
        const oc = out.getContext("2d");
        paint(oc, OUT);
        if (st.b !== 100 || st.c !== 100 || st.s !== 100) {   // bake adjustments (same order as the CSS preview)
          const im = oc.getImageData(0, 0, OUT, OUT), d = im.data;
          const b = st.b / 100, k = st.c / 100, s = st.s / 100;
          const m = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
                     0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
                     0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
          const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
          for (let i = 0; i < d.length; i += 4) {
            let r = cl(d[i] * b), g = cl(d[i + 1] * b), bl = cl(d[i + 2] * b);
            r = cl((r - 127.5) * k + 127.5); g = cl((g - 127.5) * k + 127.5); bl = cl((bl - 127.5) * k + 127.5);
            d[i] = cl(m[0] * r + m[1] * g + m[2] * bl);
            d[i + 1] = cl(m[3] * r + m[4] * g + m[5] * bl);
            d[i + 2] = cl(m[6] * r + m[7] * g + m[8] * bl);
          }
          oc.putImageData(im, 0, 0);
        }
        out.toBlob((blob) => done(blob), "image/jpeg", 0.9);
      }
    });
  }

  window.Cropper = { open };
})();
