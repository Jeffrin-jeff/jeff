"use strict";

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Footer year ---------- */
$("#year").textContent = new Date().getFullYear();

/* ---------- Nav: change style on scroll ---------- */
const nav = $("#nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- Scroll reveal ---------- */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        revealObserver.unobserve(e.target);
      }
    });
  },
  { threshold: 0.15 }
);
$$(".reveal").forEach((el) => revealObserver.observe(el));

/* ---------- Counter animation ---------- */
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const target = +el.dataset.count;
    const start = performance.now();
    const dur = 1400;
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    counterObserver.unobserve(el);
  });
}, { threshold: 0.6 });
$$("[data-count]").forEach((el) => counterObserver.observe(el));

/* ---------- Card spotlight (follows mouse) ---------- */
$$(".spot").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", e.clientX - r.left + "px");
    card.style.setProperty("--my", e.clientY - r.top + "px");
  });
});

/* ---------- Cursor glow ---------- */
const glow = $(".cursor-glow");
window.addEventListener("pointermove", (e) => {
  glow.style.left = e.clientX + "px";
  glow.style.top = e.clientY + "px";
}, { passive: true });

/* ---------- Toast ---------- */
const toast = $("#toast");
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

/* ---------- Tabs (Upload / Manual) ---------- */
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    $("#panel-file").hidden = tab.dataset.tab !== "file";
    $("#panel-manual").hidden = tab.dataset.tab !== "manual";
  });
});

/* ======================================================
   FILE UPLOAD (home page)
   Accepts PDF / JPG / PNG, max 10 MB each, up to 5 files.
   Files are kept in memory, then handed to analyze.html
   through IndexedDB (filestore.js). They are deleted from
   the browser as soon as analyze.html reads them.
   ====================================================== */
const MAX_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

const dropzone = $("#dropzone");
const fileInput = $("#fileInput");
const fileList = $("#fileList");
const fileError = $("#fileError");
const analyzeBtn = $("#analyzeBtn");
const clearBtn = $("#clearBtn");

let files = []; // [{ file, url }]

const fmtSize = (b) => (b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB");

function showError(msg) {
  fileError.textContent = msg;
  fileError.hidden = !msg;
}

function addFiles(list) {
  showError("");
  const problems = [];

  [...list].forEach((file) => {
    if (files.length >= MAX_FILES) {
      problems.push(`Only ${MAX_FILES} files allowed at a time.`);
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      problems.push(`"${file.name}" is not a PDF, JPG or PNG.`);
      return;
    }
    if (file.size > MAX_SIZE) {
      problems.push(`"${file.name}" is larger than 10 MB.`);
      return;
    }
    if (files.some((f) => f.file.name === file.name && f.file.size === file.size)) {
      problems.push(`"${file.name}" is already added.`);
      return;
    }
    const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    files.push({ file, url });
  });

  if (problems.length) showError([...new Set(problems)].join(" "));
  render();
}

function removeFile(index) {
  const [removed] = files.splice(index, 1);
  if (removed && removed.url) URL.revokeObjectURL(removed.url);
  showError("");
  render();
}

function render() {
  fileList.innerHTML = "";
  files.forEach(({ file, url }, i) => {
    const li = document.createElement("li");
    li.className = "file-item";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      thumb.appendChild(img);
    } else {
      thumb.textContent = "PDF";
    }

    const meta = document.createElement("div");
    meta.className = "file-meta";
    const name = document.createElement("strong");
    name.textContent = file.name; // textContent prevents HTML injection
    const info = document.createElement("span");
    info.textContent = `${fmtSize(file.size)} • ${file.type === "application/pdf" ? "PDF document" : "Image"}`;
    meta.append(name, info);

    const rm = document.createElement("button");
    rm.className = "remove";
    rm.type = "button";
    rm.setAttribute("aria-label", `Remove ${file.name}`);
    rm.textContent = "✕";
    rm.addEventListener("click", () => removeFile(i));

    li.append(thumb, meta, rm);
    fileList.appendChild(li);
  });

  analyzeBtn.disabled = clearBtn.disabled = files.length === 0;
}

/* Drag & drop */
["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  })
);
dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

/* Browse */
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = ""; // allow re-selecting the same file
});

/* Keyboard: Enter / Space opens file picker */
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

/* Buttons */
clearBtn.addEventListener("click", () => {
  files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
  files = [];
  showError("");
  render();
});

/* Hand the files over to analyze.html, which reads and reviews them */
analyzeBtn.addEventListener("click", async () => {
  analyzeBtn.disabled = true;
  try {
    await FileStore.put(files.map((f) => f.file)); // deleted once analyze.html reads it
    location.href = "analyze.html#uploadBox";
  } catch (err) {
    showToast("Could not pass the files over. Please upload them on the next page.");
    analyzeBtn.disabled = false;
  }
});