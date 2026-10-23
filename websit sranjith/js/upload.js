"use strict";
/* upload.js – upload box + review screen on analyze.html.
   Needs params.js, engine.js, ui.js (LabUI), extract.js. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const MAX_SIZE = 10 * 1024 * 1024, MAX_FILES = 3;
  const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
  const dz = $("#uz"), input = $("#uzInput"), prog = $("#uzProg"), bar = $("#uzBar");
  const statusEl = $("#uzStatus"), errEl = $("#uzErr"), review = $("#review");
  let busy = false;

  const showErr = (m) => { errEl.textContent = m; errEl.hidden = !m; };
  function setStatus(msg, pct) {
    statusEl.hidden = !msg; statusEl.textContent = msg || "";
    prog.hidden = pct == null;
    if (pct != null) bar.style.width = Math.max(2, Math.min(100, pct)) + "%";
  }

  /* ---------- take files ---------- */
  function validFiles(list) {
    const ok = [], problems = [];
    [...list].forEach((f) => {
      if (ok.length >= MAX_FILES) problems.push(`Only ${MAX_FILES} files at a time.`);
      else if (!ALLOWED.includes(f.type)) problems.push(`"${f.name}" is not a PDF, JPG or PNG.`);
      else if (f.size > MAX_SIZE) problems.push(`"${f.name}" is larger than 10 MB.`);
      else ok.push(f);
    });
    showErr([...new Set(problems)].join(" "));
    return ok;
  }

  async function handleFiles(list) {
    if (busy) return;
    const files = validFiles(list);
    if (!files.length) return;
    busy = true; review.hidden = true; dz.style.pointerEvents = "none";
    try {
      let text = "", source = "pdf";
      for (let i = 0; i < files.length; i++) {
        setStatus(`Reading ${files[i].name}…`, (i / files.length) * 100);
        const r = await Extract.fromFile(files[i], (msg, p) => setStatus(msg, ((i + (p || 0) / 100) / files.length) * 100));
        text += "\n" + r.text;
        if (r.source === "ocr") source = "ocr";
      }
      setStatus("", null);
      showReview(Extract.parse(text, source), text, source);
    } catch (e) {
      setStatus("", null);
      showErr(e.message || "Something went wrong while reading the file.");
    } finally {
      await Extract.dispose();
      busy = false; dz.style.pointerEvents = "";
    }
  }

  /* ---------- review screen ---------- */
  function rowHTML(r) {
    const unitEl = r.units.length > 1
      ? `<select class="unit-sel rv-unit" aria-label="Unit for ${esc(r.name)}">${r.units.map((u) => `<option value="${esc(u)}"${u === r.unit ? " selected" : ""}>${esc(u)}</option>`).join("")}</select>`
      : `<span class="rv-unit-fixed">${esc(r.unit)}</span>`;
    return `<div class="rv-row${r.check ? " check" : ""}" data-id="${r.id}">
      <div class="rv-name">${esc(r.name)}${r.ref ? `<span class="rv-ref">Lab range: ${esc(r.ref)}</span>` : ""}</div>
      <input class="inp rv-val" type="number" step="any" min="0" value="${r.value}" aria-label="${esc(r.name)} value" />
      ${unitEl}
      <span class="chip sm ${r.check ? "warn" : "ok"}">${r.check ? "⚠ Check" : "✓ OK"}</span>
      <button type="button" class="remove" aria-label="Remove ${esc(r.name)}">✕</button>
      ${r.reasons.length ? `<p class="rv-note">${r.reasons.map(esc).join(" ")}</p>` : ""}
    </div>`;
  }

  function showReview(res, text, source) {
    /* pre-fill age and sex if the report has them (the user still confirms) */
    let filled = false;
    if (res.profile.age && !$("#age").value) { $("#age").value = res.profile.age; filled = true; }
    if (res.profile.sex && !$('input[name="sex"]:checked')) { $(`input[name="sex"][value="${res.profile.sex}"]`).checked = true; filled = true; }
    if (filled) document.dispatchEvent(new Event("input"));

    const rows = res.rows.slice().sort((a, b) => Number(b.check) - Number(a.check));
    const need = rows.filter((r) => r.check).length;
    let h = `<h3>Review what we read</h3>`;

    if (!rows.length) {
      h += `<p class="rv-banner">We could not find any known test names in this file. Check the text below, try a clearer photo, or enter the values by hand in the panels below.</p>`;
    } else {
      h += `<p class="rv-sub">Found <b>${rows.length}</b> value${rows.length > 1 ? "s" : ""}${need ? `, <b>${need}</b> need checking` : ""}. Compare each one with your report, fix anything wrong and remove what you don't want. <b>Nothing is analysed until you confirm.</b></p>`;
      if (source === "ocr") h += `<p class="rv-banner">This text was read from an image, so digits like 0/O, 1/l and 5/S can be misread. Check every number.</p>`;
      if (filled) h += `<p class="rv-banner ok">Age and sex were filled in above from the report. Please check them.</p>`;
      h += `<div class="rv-list">${rows.map(rowHTML).join("")}</div>`;
    }

    h += `<p class="error" id="rvMsg" role="alert"></p>
      <div class="upload-actions">
        ${rows.length ? `<button type="button" class="btn btn-primary" id="rvConfirm">Confirm &amp; analyze</button>` : ""}
        <button type="button" class="btn btn-ghost" id="rvDiscard">Discard</button>
      </div>
      <details class="raw"><summary>Show the text we read</summary><pre id="rvRaw"></pre></details>`;
    review.innerHTML = h;
    $("#rvRaw").textContent = text.trim() || "(no text found)";
    review.hidden = false;
    review.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function confirmReview() {
    const msg = $("#rvMsg"); msg.textContent = "";
    const ageRaw = $("#age").value.trim();
    const sexEl = $('input[name="sex"]:checked');
    const pv = validateProfile({ age: ageRaw === "" ? NaN : Number(ageRaw), sex: sexEl ? sexEl.value : "" });
    if (!pv.valid) {
      msg.textContent = "Please set a valid age (18 or over) and sex in “About you” above, then confirm again.";
      $("#age").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const values = {}; let bad = false;
    $$(".rv-row", review).forEach((row) => {
      row.dataset.bad = "false";
      const p = PARAM_BY_ID[row.dataset.id];
      const raw = $(".rv-val", row).value.trim();
      if (raw === "") return;
      const sel = $(".rv-unit", row);
      let base;
      try { base = toBase(p, Number(raw), sel ? sel.value : p.unit); } catch { base = NaN; }
      if (validateValue(p, base).error) { row.dataset.bad = "true"; bad = true; return; }
      values[p.id] = Math.round(base * 1000) / 1000;
    });
    if (bad) { msg.textContent = "Some values are not valid numbers. Fix the highlighted rows."; return; }
    const n = Object.keys(values).length;
    if (!n) { msg.textContent = "There are no values to add."; return; }

    const name = $("#pname").value, age = $("#age").value, sex = sexEl.value;
    LabUI.clearAll();
    $("#pname").value = name;
    LabUI.fill({ age, sex }, values);

    review.innerHTML = `<p class="rv-done">✓ Added <b>${n}</b> value${n > 1 ? "s" : ""} to the form. You can still edit them in the panels below. Your results are updated.</p>`;
    $("#resultsSection").scrollIntoView({ behavior: "smooth" });
  }

  review.addEventListener("click", (e) => {
    if (e.target.closest(".remove")) e.target.closest(".rv-row").remove();
    else if (e.target.id === "rvConfirm") confirmReview();
    else if (e.target.id === "rvDiscard") { review.hidden = true; review.innerHTML = ""; }
  });

  /* ---------- events ---------- */
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
  input.addEventListener("change", () => { handleFiles(input.files); input.value = ""; });
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });

  $("#pasteBtn").addEventListener("click", () => {
    const t = $("#pasteTxt").value;
    if (t.trim().length < 10) { showErr("Paste some report text first."); return; }
    showErr(""); showReview(Extract.parse(t, "text"), t, "text");
  });

  /* files sent from the home page */
  if (window.FileStore) FileStore.take().then((f) => { if (f && f.length) handleFiles(f); }).catch(() => {});
})();