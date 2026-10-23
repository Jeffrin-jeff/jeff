"use strict";
/* ============================================================
   engine.js – judges values against ranges. No DOM code here,
   so the same engine serves manual entry AND uploaded reports.
   Needs params.js loaded first.
   ============================================================ */

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const r6 = (n) => Math.round(n * 1e6) / 1e6; // kills float noise: 6.4 - 5.6 = 0.8000000000000007
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const STATUS = { ok: "Normal", warn: "Borderline", bad: "Abnormal" };

/* ---------- range helpers ---------- */
function getRange(p, sex) {
  const r = p.range;
  if (Array.isArray(r)) return r;
  return r[sex] || r.male;
}

function getMargin(p, lo, hi) {
  const m = p.margin || {};
  const width = lo != null && hi != null ? hi - lo : hi != null ? hi : lo;
  const fallback = r6(width * 0.1); // fallback rule: 10% of range width
  return { low: m.low != null ? m.low : fallback, high: m.high != null ? m.high : fallback };
}

function plausRange(p) {
  if (p.plaus) return p.plaus;
  const [lo, hi] = getRange(p, "male");
  return [0, Math.max(lo || 0, hi || 0) * 10];
}

/* ---------- validation ---------- */
function validateValue(p, v) {
  if (v === "" || v == null || !Number.isFinite(Number(v))) return { error: "Enter a number.", warning: null };
  v = Number(v);
  if (v < 0) return { error: "Value cannot be negative.", warning: null };
  const [min, max] = plausRange(p);
  if (v < min || v > max) return { error: null, warning: "This looks unusual. Please check the value and unit." };
  return { error: null, warning: null };
}

function validateProfile(profile) {
  const errors = {};
  const age = Number(profile.age);
  if (!Number.isInteger(age) || age < 18 || age > 120) errors.age = "This tool supports adults aged 18 to 120.";
  if (!["male", "female"].includes(profile.sex)) errors.sex = "Please select male or female.";
  return { valid: Object.keys(errors).length === 0, errors };
}

/* ---------- unit conversion ---------- */
function toBase(p, value, fromUnit) {
  if (!fromUnit || fromUnit === p.unit) return value;
  const c = (p.conv || []).find((x) => x.unit === fromUnit);
  if (!c) throw new Error(`No conversion from ${fromUnit} for ${p.id}`);
  return c.toBase(value);
}
function fromBase(p, value, toUnit) {
  if (!toUnit || toUnit === p.unit) return value;
  const c = (p.conv || []).find((x) => x.unit === toUnit);
  if (!c) throw new Error(`No conversion to ${toUnit} for ${p.id}`);
  return c.fromBase(value);
}
const convert = (p, value, from, to) => fromBase(p, toBase(p, value, from), to);

/* ---------- the core: judge one value ---------- */
function judge(value, p, sex) {
  const [lo, hi] = getRange(p, sex);
  const m = getMargin(p, lo, hi);
  const width = lo != null && hi != null ? hi - lo : hi != null ? hi : lo;

  let dir = "none", dist = 0, margin = 0;
  if (lo != null && value < lo) { dir = "low"; dist = r6(lo - value); margin = m.low; }
  else if (hi != null && value > hi) { dir = "high"; dist = r6(value - hi); margin = m.high; }

  let level = dir === "none" ? "ok" : dist <= margin ? "warn" : "bad";

  const c = p.critical || {};
  const critical = (c.low != null && value < c.low) || (c.high != null && value > c.high);
  if (critical) level = "bad";

  return {
    level,                                   // "ok" | "warn" | "bad"  (drives colour)
    status: STATUS[level],                   // Normal | Borderline | Abnormal (always shown as a word too)
    dir,                                     // "low" | "high" | "none"
    label: level === "ok" ? "Normal" : (level === "warn" ? "Borderline " : "") + cap(dir),
    critical,
    explanation: dir === "low" ? p.low : dir === "high" ? p.high : "Within the usual range.",
    range: [lo, hi],
    deviation: width ? round(dist / width, 3) : 0,
  };
}

/* ---------- BMI ---------- */
function bmi(kg, cm) {
  const m = cm / 100;
  return kg / (m * m);
}

function bmiCategory(b, asian) {
  if (b < 18.5) return "Underweight";
  const over = asian ? 23 : 25, obese = asian ? 25 : 30;
  if (b < over) return "Healthy weight";
  if (b < obese) return "Overweight";
  return "Obesity range";
}

function judgeBMI(b, asian = true) {
  const p = {
    ...PARAM_BY_ID.bmi,
    range: asian ? [18.5, 22.9] : [18.5, 24.9],
    margin: asian ? { low: 1.5, high: 2 } : { low: 1.5, high: 5 },
  };
  const r = judge(b, p, "male");
  r.category = bmiCategory(b, asian);
  return r;
}

/* ---------- Blood pressure: systolic + diastolic judged together ---------- */
function judgeBP(sys, dia) {
  let cat, level, critical = false, dir = "high", text;

  if (sys > 180 || dia > 120) {
    cat = "Very high"; level = "bad"; critical = true;
    text = "Very high. If you also have chest pain, severe headache, breathlessness or weakness, seek emergency care now.";
  } else if (sys < 80 || dia < 50) {
    cat = "Very low"; level = "bad"; critical = true; dir = "low";
    text = "Very low. Seek medical care promptly, especially if you feel faint or confused.";
  } else if (sys >= 140 || dia >= 90) {
    cat = "High (Stage 2)"; level = "bad";
    text = "May indicate high blood pressure that usually needs medical review.";
  } else if (sys >= 130 || dia >= 80) {
    cat = "High (Stage 1)"; level = "warn";
    text = "May indicate high blood pressure. Repeat readings on different days and discuss with a doctor.";
  } else if (sys >= 120) {
    cat = "Elevated"; level = "warn";
    text = "Slightly above ideal. Less salt, regular exercise and weight control can help.";
  } else if (sys < 90 || dia < 60) {
    cat = "Low"; level = "warn"; dir = "low";
    text = "Low readings can be normal for some people, but see a doctor if you feel dizzy or faint.";
  } else {
    cat = "Normal"; level = "ok"; dir = "none";
    text = "Within the healthy range.";
  }

  return {
    level, status: STATUS[level], dir,
    label: level === "ok" ? "Normal" : cat,
    critical, explanation: text, range: [null, 119],
    deviation: level === "ok" ? 0 : round(Math.abs(sys - 120) / 120, 3),
    category: cat,
  };
}

/* ---------- Analyse a whole report ----------
   profile : { age, sex: "male"|"female", asian?: boolean (default true) }
   values  : { hb: 13.2, fbs: 110, bp_sys: 130, bp_dia: 85, height_cm: 170, weight_kg: 70, ... }
             (all in the BASE units from params.js; convert first with toBase())  */
function analyze(profile, values) {
  const vals = { ...values };
  if (vals.height_cm > 0 && vals.weight_kg > 0) vals.bmi = round(bmi(vals.weight_kg, vals.height_cm), 1);

  const results = [];
  PARAMS.forEach((p) => {
    if (p.special === "bp") return;
    const v = vals[p.id];
    if (v == null || !Number.isFinite(v)) return;
    const r = p.id === "bmi" ? judgeBMI(v, profile.asian !== false) : judge(v, p, profile.sex);
    results.push({ ...r, id: p.id, name: p.name, panel: p.panel, unit: p.unit, value: v });
  });

  if (Number.isFinite(vals.bp_sys) && Number.isFinite(vals.bp_dia)) {
    results.push({
      ...judgeBP(vals.bp_sys, vals.bp_dia),
      id: "bp", name: "Blood pressure", panel: "Vitals", unit: "mmHg",
      value: `${vals.bp_sys}/${vals.bp_dia}`,
    });
  }

  results.sort((a, b) => PANELS.indexOf(a.panel) - PANELS.indexOf(b.panel));
  return { results, summary: summarize(results) };
}

/* ---------- Summary: counts, per-panel counts, critical list, top items ---------- */
function summarize(results) {
  const counts = { normal: 0, borderline: 0, abnormal: 0 };
  const byPanel = {};
  const criticals = [];

  results.forEach((r) => {
    const key = r.level === "ok" ? "normal" : r.level === "warn" ? "borderline" : "abnormal";
    counts[key]++;
    if (!byPanel[r.panel]) byPanel[r.panel] = { normal: 0, borderline: 0, abnormal: 0 };
    byPanel[r.panel][key]++;
    if (r.critical) criticals.push(r);
  });

  const top = results
    .filter((r) => r.level !== "ok")
    .map((r) => ({ r, score: (r.critical ? 1000 : 0) + (r.level === "bad" ? 100 : 0) + (r.deviation || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.r);

  return { counts, byPanel, criticals, top, total: results.length };
}