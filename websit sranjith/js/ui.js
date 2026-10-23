"use strict";
/* ============================================================
   ui.js – manual entry form + live results.
   Needs params.js and engine.js loaded first.
   The form is GENERATED from PARAMS, so adding a test to
   params.js adds it here automatically.
   ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  const clamp = (n, a = 0, b = 100) => Math.min(b, Math.max(a, n));
  const ICON = { ok: "✓", warn: "⚠", bad: "✕" };

  /* ---------- field definitions ---------- */
  const FIELD = {};
  PARAMS.forEach((p) => { if (!p.calc) FIELD[p.id] = p; });
  BODY_INPUTS.forEach((b) => (FIELD[b.id] = b));

  /* ---------- small helpers ---------- */
  function rangeFrom(lo, hi, unit) {
    if (lo != null && hi != null) return `${fmt(lo)}–${fmt(hi)} ${unit}`;
    if (hi != null) return `up to ${fmt(hi)} ${unit}`;
    return `${fmt(lo)} or above ${unit}`;
  }
  const rangeText = (p, sex) => rangeFrom(...getRange(p, sex), p.unit);
  const chip = (r) => `<span class="chip ${r.level} sm">${ICON[r.level]} ${esc(r.label)}</span>`;

  /* ======================================================
     BUILD THE FORM
     ====================================================== */
  function fieldHTML(p) {
    const unitEl = p.conv && p.conv.length
      ? `<select class="unit-sel" data-unit-for="${p.id}" aria-label="Unit for ${esc(p.name)}">
           <option value="${esc(p.unit)}">${esc(p.unit)}</option>
           ${p.conv.map((c) => `<option value="${esc(c.unit)}">${esc(c.unit)}</option>`).join("")}
         </select>`
      : `<span class="unit">${esc(p.unit)}</span>`;
    return `<div class="field">
      <label class="lbl" for="f-${p.id}">${esc(p.name)}</label>
      <div class="input-row">
        <input class="inp" id="f-${p.id}" data-id="${p.id}" type="number" step="any" min="0" inputmode="decimal" autocomplete="off" />
        ${unitEl}
      </div>
      <div class="hint" id="h-${p.id}" aria-live="polite"></div>
    </div>`;
  }

  const panelsEl = $("#panels");
  PANELS.forEach((panel, i) => {
    let html;
    if (panel === "Body") {
      html = BODY_INPUTS.map(fieldHTML).join("") +
        `<div class="field"><span class="lbl">BMI (calculated)</span><div class="bmi-val" id="bmiVal">Enter height and weight</div></div>`;
    } else {
      html = PARAMS.filter((p) => p.panel === panel && !p.calc).map(fieldHTML).join("");
    }
    const d = document.createElement("details");
    d.className = "panel-card";
    if (i === 0) d.open = true;
    d.innerHTML = `<summary><span class="p-title">${esc(panel)}</span><span class="p-count">empty</span></summary><div class="fields">${html}</div>`;
    panelsEl.appendChild(d);
  });

  /* report date defaults to today (local time) */
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $("#rdate").value = today;
  $("#rdate").max = today;

  /* ======================================================
     READ INPUTS
     ====================================================== */
  function readProfile() {
    const ageRaw = $("#age").value.trim();
    const sexEl = $('input[name="sex"]:checked');
    return { age: ageRaw === "" ? NaN : Number(ageRaw), sex: sexEl ? sexEl.value : "", asian: $("#asian").checked };
  }

  function readValues() {
    const values = {}, info = {};
    $$("input[data-id]").forEach((inp) => {
      const id = inp.dataset.id, def = FIELD[id], raw = inp.value.trim();
      const i = (info[id] = { entered: false, error: null, warning: null });
      if (raw === "") return;
      i.entered = true;
      const n = Number(raw);
      if (!Number.isFinite(n)) { i.error = "Enter a number."; return; }
      if (n < 0) { i.error = "Value cannot be negative."; return; }
      const sel = $(`select[data-unit-for="${id}"]`);
      const unit = sel ? sel.value : def.unit;
      let base;
      try { base = toBase(def, n, unit); } catch { i.error = "Unit not supported."; return; }
      const v = validateValue(def, base);
      if (v.error) { i.error = v.error; return; }
      i.warning = v.warning; i.unit = unit; i.enteredVal = n;
      values[id] = Math.round(base * 1000) / 1000;
    });
    return { values, info };
  }

  /* ======================================================
     REFRESH (runs on every keystroke)
     ====================================================== */
  let last = null, resultTimer;

  function refresh() {
    const profile = readProfile();
    const pv = validateProfile(profile);
    const { values, info } = readValues();
    const a = pv.valid && Object.keys(values).length ? analyze(profile, values) : null;
    last = { profile, pv, values, info, a };
    paintHints();
    paintPanelCounts();
    paintLiveBar();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(paintResults, 200); // small delay so typing never feels laggy
  }

  function paintHints() {
    const { profile, pv, info, a } = last;
    const map = a ? Object.fromEntries(a.results.map((r) => [r.id, r])) : {};

    const ageBad = !Number.isNaN(profile.age) && !!pv.errors.age;
    $("#ageErr").textContent = ageBad ? pv.errors.age : "";
    $("#age").setAttribute("aria-invalid", ageBad ? "true" : "false");

    Object.keys(FIELD).forEach((id) => {
      const i = info[id], el = $("#h-" + id);
      let html = "";
      if (i.error) {
        html = `<span class="err">${esc(i.error)}</span>`;
      } else if (i.entered) {
        const r = id === "bp_sys" || id === "bp_dia" ? map.bp : map[id];
        if (r) html += chip(r);
        if (i.warning) html += `<span class="warn-txt">⚠ ${esc(i.warning)}</span>`;
      } else if (profile.sex && FIELD[id].range) {
        html = `<span class="typ">Typical: ${esc(rangeText(FIELD[id], profile.sex))}</span>`;
      }
      el.innerHTML = html;
      $("#f-" + id).setAttribute("aria-invalid", i.error ? "true" : "false");
    });

    const b = map.bmi;
    $("#bmiVal").innerHTML = b
      ? `<b>${fmt(b.value)}</b> kg/m² ${chip(b)} <span>${esc(b.category || "")}</span>`
      : "Enter height and weight";
  }

  function paintPanelCounts() {
    $$("details.panel-card").forEach((d) => {
      const n = $$("input[data-id]", d).filter((inp) => {
        const i = last.info[inp.dataset.id];
        return i.entered && !i.error;
      }).length;
      const c = $(".p-count", d);
      c.textContent = n ? `${n} filled` : "empty";
      c.classList.toggle("on", n > 0);
    });
  }

  function paintLiveBar() {
    const bar = $("#liveBar");
    if (!last.a) { bar.hidden = true; return; }
    const c = last.a.summary.counts;
    $("#liveTxt").innerHTML =
      `${last.a.summary.total} values · <b class="ok">${c.normal}</b> normal · <b class="warn">${c.borderline}</b> borderline · <b class="bad">${c.abnormal}</b> abnormal`;
    bar.hidden = false;
  }

  /* ======================================================
     RANGE BAR MODEL
     Returns coloured segments (in % of bar width), marker, ticks.
     ====================================================== */
  function barModel(r) {
    if (r.id === "bp") {
      const min = 70, max = 200, pc = (x) => clamp(((x - min) / (max - min)) * 100);
      const sys = Number(String(r.value).split("/")[0]);
      const cuts = [[70, 80, "bad"], [80, 90, "warn"], [90, 120, "ok"], [120, 140, "warn"], [140, 200, "bad"]];
      return {
        segs: cuts.map(([a, b, c]) => ({ l: pc(a), w: pc(b) - pc(a), c })),
        marker: pc(sys), ticks: [{ p: pc(90), t: "90" }, { p: pc(120), t: "120" }],
        note: "Bar shows the top number (systolic). The status uses both numbers.",
      };
    }
    const p = PARAM_BY_ID[r.id], [lo, hi] = r.range, v = r.value;
    let m = getMargin(p, lo, hi);
    if (r.id === "bmi") m = { low: 1.5, high: last.profile.asian !== false ? 2 : 5 };
    const width = lo != null && hi != null ? hi - lo : hi != null ? hi : lo;

    let min = lo != null ? Math.max(0, lo - m.low * 2.5) : 0;
    let max = hi != null ? hi + m.high * 2.5 : lo + width;
    if (max <= min) max = min + 1;
    const pad = (max - min) * 0.06;
    if (v < min) min = Math.max(0, v - pad);
    if (v > max) max = v + pad;

    const pc = (x) => clamp(((x - min) / (max - min)) * 100);
    const segs = [];
    const add = (a, b, c) => { if (b > a) segs.push({ l: pc(a), w: pc(b) - pc(a), c }); };
    if (lo != null) { add(min, lo - m.low, "bad"); add(Math.max(min, lo - m.low), lo, "warn"); }
    add(lo != null ? lo : min, hi != null ? hi : max, "ok");
    if (hi != null) { add(hi, hi + m.high, "warn"); add(hi + m.high, max, "bad"); }

    const ticks = [];
    if (lo != null) ticks.push({ p: pc(lo), t: fmt(lo) });
    if (hi != null) ticks.push({ p: pc(hi), t: fmt(hi) });
    return { segs, marker: pc(v), ticks, note: "" };
  }

  /* ======================================================
     RESULTS
     ====================================================== */
  const emptyBox = (title, text) => `<div class="empty"><h3>${title}</h3><p>${text}</p></div>`;

  function cardHTML(r) {
    const bm = barModel(r);
    const val = r.id === "bp" ? esc(r.value) : fmt(r.value);
    const typ = r.id === "bp" ? "Ideal: below 120/80 mmHg" : `Typical: ${rangeFrom(r.range[0], r.range[1], r.unit)}`;
    const i = last.info[r.id];
    const entered = i && i.unit && i.unit !== r.unit ? `<small>Entered as ${fmt(i.enteredVal)} ${esc(i.unit)}</small>` : "";
    return `<article class="rcard ${r.level}${r.critical ? " crit" : ""}">
      <div class="rhead"><h4>${esc(r.name)}</h4>${chip(r)}</div>
      <div class="rval"><b>${val}</b> ${esc(r.unit)}<small>${esc(typ)}</small>${entered}</div>
      <div class="barwrap" role="img" aria-label="${esc(r.name)} ${val} ${esc(r.unit)}: ${esc(r.status)}">
        <div class="track">${bm.segs.map((s) => `<span class="seg ${s.c}" style="left:${s.l}%;width:${s.w}%"></span>`).join("")}</div>
        <span class="marker" style="left:${bm.marker}%"></span>
        <div class="ticks">${bm.ticks.map((t) => `<span style="left:${t.p}%">${t.t}</span>`).join("")}</div>
      </div>
      ${bm.note ? `<p class="barnote">${esc(bm.note)}</p>` : ""}
      ${r.category && r.id === "bmi" ? `<p class="cat">Category: ${esc(r.category)}</p>` : ""}
      <p class="expl">${esc(r.explanation)}</p>
      ${r.critical ? `<p class="crit-note">⚠ Far outside the usual range. Please contact a doctor soon.</p>` : ""}
    </article>`;
  }

  function paintResults() {
    const R = $("#results");
    if (!last.pv.valid) {
      R.innerHTML = emptyBox("Add your age and sex first", "Reference ranges depend on them. This tool supports adults aged 18 and over.");
      return;
    }
    if (!last.a) {
      R.innerHTML = emptyBox("Waiting for values", "Type any test value above and your results appear here instantly.");
      return;
    }

    const { results, summary } = last.a;
    const c = summary.counts;
    const name = $("#pname").value.trim();
    const dateVal = $("#rdate").value;
    const dateTxt = dateVal ? new Date(dateVal + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
    const meta = [`Age ${last.profile.age}`, last.profile.sex === "male" ? "Male" : "Female", dateTxt].filter(Boolean).join(" · ");

    let html = `<div class="res-meta"><h3>${name ? "Results for " + esc(name) : "Your results"}</h3><p>${esc(meta)}</p></div>`;

    if (summary.criticals.length) {
      html += `<div class="banner" role="alert"><span class="bi">⚠</span><div>
        <h3>Critical value alert</h3>
        <ul>${summary.criticals.map((r) => `<li><b>${esc(r.name)}</b>: ${r.id === "bp" ? esc(r.value) : fmt(r.value)} ${esc(r.unit)} (${esc(r.label)})</li>`).join("")}</ul>
        <p>A value this far outside the usual range may need prompt medical attention. Please contact a doctor or your lab soon. If you have chest pain, breathlessness, severe weakness or confusion, seek emergency care.</p>
      </div></div>`;
    }

    html += `<div class="summary">
      <div class="stat ok"><b>${c.normal}</b><span>Normal</span></div>
      <div class="stat warn"><b>${c.borderline}</b><span>Borderline</span></div>
      <div class="stat bad"><b>${c.abnormal}</b><span>Abnormal</span></div>
    </div>`;

    html += `<div class="panel-chips">${Object.entries(summary.byPanel).map(([panel, n]) =>
      `<span class="pchip">${esc(panel)}${n.normal ? `<i class="ok">${n.normal}</i>` : ""}${n.borderline ? `<i class="warn">${n.borderline}</i>` : ""}${n.abnormal ? `<i class="bad">${n.abnormal}</i>` : ""}</span>`).join("")}</div>`;

    if (summary.top.length) {
      html += `<div class="box top"><h4>Top items to discuss with your doctor</h4><ol>${summary.top.map((r) =>
        `<li><b>${esc(r.name)}</b>, ${r.id === "bp" ? esc(r.value) : fmt(r.value)} ${esc(r.unit)} ${chip(r)}</li>`).join("")}</ol></div>`;
    }

    let current = "";
    results.forEach((r) => {
      if (r.panel !== current) {
        if (current) html += `</div>`;
        current = r.panel;
        html += `<h3 class="panel-title">${esc(current)}</h3><div class="rgrid">`;
      }
      html += cardHTML(r);
    });
    html += `</div>`;

    html += `<p class="res-disclaimer"><strong>Medical disclaimer:</strong> These results are for education and general awareness. "Borderline" and "abnormal" do not mean you have a disease, and many values change with food, hydration, medicines and the lab used. Please discuss your report with a doctor.</p>`;
    R.innerHTML = html;
  }

  /* ======================================================
     BUTTONS & EVENTS
     ====================================================== */
  function fill(profile = {}, values = {}) {
    if (profile.age != null) $("#age").value = profile.age;
    if (profile.sex) { const r = $(`input[name="sex"][value="${profile.sex}"]`); if (r) r.checked = true; }
    Object.entries(values).forEach(([id, v]) => {
      const inp = $("#f-" + id);
      if (!inp) return;
      const sel = $(`select[data-unit-for="${id}"]`);
      if (sel) sel.selectedIndex = 0; // values passed in are in base units
      inp.value = v;
      const d = inp.closest("details");
      if (d) d.open = true;
    });
    refresh();
  }

  function clearAll() {
    $$("input[data-id]").forEach((i) => (i.value = ""));
    $$("select[data-unit-for]").forEach((s) => (s.selectedIndex = 0));
    $("#age").value = "";
    $("#pname").value = "";
    $$('input[name="sex"]').forEach((r) => (r.checked = false));
    refresh();
  }

  $("#sampleBtn").addEventListener("click", () =>
    fill({ age: 35, sex: "male" }, {
      hb: 12.8, wbc: 7.2, plt: 240,
      fbs: 108, hba1c: 6.0,
      tc: 215, ldl: 142, hdl: 38, tg: 180,
      cr: 1.0, k: 4.2, tsh: 3.2, vitd: 14, crp: 8,
      bp_sys: 134, bp_dia: 86, pulse: 78, spo2: 98,
      height_cm: 170, weight_kg: 72,
    }));
  $("#clearBtn").addEventListener("click", clearAll);
  $("#viewBtn").addEventListener("click", () => $("#resultsSection").scrollIntoView({ behavior: "smooth" }));

  document.addEventListener("input", refresh);
  document.addEventListener("change", refresh);

  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Step 4 (upload + OCR) will call this: LabUI.fill(profile, valuesInBaseUnits) */
  window.LabUI = { fill, clearAll };

  refresh();
})();