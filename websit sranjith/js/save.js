"use strict";
/* ============================================================
   save.js – "Save to my history" on analyze.html.
   Also reopens a saved report from history.html
   (analyze.html?report=ID).
   Needs: params.js, engine.js, ui.js (LabUI), storage.js.
   ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const results = $("#results");
  if (!results || !window.Store) return;

  let currentId = null; // set when a saved report is opened or just saved

  /* ---------- build the box ---------- */
  const box = document.createElement("div");
  box.className = "savebox";
  box.id = "saveBox";
  box.innerHTML = `
    <div class="save-txt">
      <strong>Save to my history</strong>
      <span id="saveHint">Add your age, sex and at least one value.</span>
    </div>
    <div class="save-actions">
      <button type="button" class="btn btn-primary" id="saveBtn" disabled>Save report</button>
      <button type="button" class="btn btn-ghost" id="saveNewBtn" hidden>Save as new copy</button>
      <a class="btn btn-ghost" href="history.html">View history</a>
    </div>
    <p class="save-msg" id="saveMsg" role="status" aria-live="polite"></p>`;
  results.insertAdjacentElement("beforebegin", box);

  const saveBtn = $("#saveBtn"), saveNewBtn = $("#saveNewBtn"), hint = $("#saveHint"), msg = $("#saveMsg");
  const setMsg = (html, isErr) => { msg.innerHTML = html; msg.classList.toggle("err", !!isErr); };

  /* ---------- read the form (same rules as ui.js) ---------- */
  function readState() {
    const ageRaw = $("#age").value.trim();
    const sexEl = $('input[name="sex"]:checked');
    const profile = { age: ageRaw === "" ? NaN : Number(ageRaw), sex: sexEl ? sexEl.value : "", asian: $("#asian").checked };
    const pv = validateProfile(profile);
    const values = {};
    $$("input[data-id]").forEach((inp) => {
      const raw = inp.value.trim();
      if (raw === "") return;
      const id = inp.dataset.id;
      const def = PARAM_BY_ID[id] || BODY_INPUTS.find((b) => b.id === id);
      const n = Number(raw);
      if (!def || !Number.isFinite(n) || n < 0) return;
      const sel = $(`select[data-unit-for="${id}"]`);
      let base;
      try { base = toBase(def, n, sel ? sel.value : def.unit); } catch { return; }
      if (validateValue(def, base).error) return;
      values[id] = Math.round(base * 1000) / 1000;
    });
    return { profile, pv, values };
  }

  /* ---------- build the object that is stored ---------- */
  function buildReport(s) {
    const a = analyze(s.profile, s.values);
    /* series = what the trend chart needs: value, range used at that time, status */
    const series = {};
    a.results.forEach((r) => {
      if (r.id === "bp") return;
      series[r.id] = { v: r.value, lo: r.range[0], hi: r.range[1], lvl: r.level };
    });
    const bp = a.results.find((r) => r.id === "bp");
    if (bp) {
      series.bp_sys = { v: s.values.bp_sys, lo: null, hi: 119, lvl: bp.level };
      series.bp_dia = { v: s.values.bp_dia, lo: null, hi: 79, lvl: bp.level };
    }
    return {
      id: currentId,
      name: $("#pname").value.trim().slice(0, 60),
      date: $("#rdate").value || new Date().toISOString().slice(0, 10),
      profile: { age: s.profile.age, sex: s.profile.sex, asian: s.profile.asian },
      values: s.values,
      series,
      counts: a.summary.counts,
      total: a.summary.total,
      flagged: a.summary.top.slice(0, 3).map((r) => `${r.name} (${r.label})`),
    };
  }

  /* ---------- button state ---------- */
  function update() {
    if (!Store.available()) {
      saveBtn.disabled = true;
      hint.textContent = "Your browser is blocking saving (private mode?). Results still work.";
      return;
    }
    const s = readState();
    const n = Object.keys(s.values).length;
    if (!s.pv.valid) { saveBtn.disabled = true; hint.textContent = "Set a valid age (18 or over) and sex first."; }
    else if (!n) { saveBtn.disabled = true; hint.textContent = "Enter at least one test value."; }
    else { saveBtn.disabled = false; hint.textContent = `Ready to save ${n} value${n > 1 ? "s" : ""} on this device only.`; }
  }

  function doSave(asNew) {
    const s = readState();
    if (!s.pv.valid || !Object.keys(s.values).length) return;
    if (asNew) currentId = null;
    const id = Store.save(buildReport(s));
    if (!id) { setMsg("Could not save. Browser storage may be full or blocked.", true); return; }
    currentId = id;
    saveNewBtn.hidden = false;
    saveBtn.textContent = "Save changes";
    setMsg(`Saved ✓ &nbsp;<a href="history.html">Open history</a>`, false);
  }

  saveBtn.addEventListener("click", () => doSave(false));
  saveNewBtn.addEventListener("click", () => doSave(true));

  let t;
  const schedule = () => { clearTimeout(t); t = setTimeout(() => { setMsg("", false); update(); }, 150); };
  document.addEventListener("input", schedule);
  document.addEventListener("change", schedule);

  /* ---------- reopen a saved report: analyze.html?report=ID ---------- */
  const wanted = new URLSearchParams(location.search).get("report");
  if (wanted) {
    const r = Store.get(wanted);
    if (r) {
      currentId = r.id;
      $("#pname").value = r.name || "";
      if (r.date) $("#rdate").value = r.date;
      $("#asian").checked = !(r.profile && r.profile.asian === false);
      LabUI.fill({ age: r.profile.age, sex: r.profile.sex }, r.values);
      saveBtn.textContent = "Save changes";
      saveNewBtn.hidden = false;
      const d = r.date ? new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
      setMsg(`Opened your saved report${d ? " from " + d : ""}. Edit and press “Save changes”, or “Save as new copy”.`, false);
    } else {
      setMsg("That saved report was not found. It may have been deleted.", true);
    }
  }

  update();
})();