"use strict";
/* ============================================================
   params.js – the single source of truth for every test.
   Everything else (form, engine, parser, charts) reads this file.

   Fields
   - range    : [low, high]  or  { male:[..], female:[..] }.  null = no limit on that side.
   - margin   : how far OUTSIDE the range still counts as "borderline".
                { low, high } in the parameter's own unit. If missing, 10% of range width is used.
   - critical : { low, high } alert limits (strictly below / above).
   - plaus    : [min, max] physically plausible values. Outside = probably a typing/OCR error.
   - conv     : alternative units the user may have on their report.
   - aliases  : names used by the report parser (Step 4), lowercase.
   Ranges are typical adult values. Labs differ, so always show the lab's own range as a note.
   ============================================================ */

/* factor helper: base = value × f */
const fac = (unit, f) => ({ unit, toBase: (v) => v * f, fromBase: (v) => v / f });

function def(id, name, panel, unit, range, aliases, low, high, extra = {}) {
  return { id, name, panel, unit, range, aliases, low, high, ...extra };
}

const PANELS = [
  "Blood count", "Diabetes", "Lipids", "Liver", "Kidney", "Electrolytes",
  "Thyroid", "Vitamins & iron", "Inflammation", "Vitals", "Body",
];

const PARAMS = [
  /* ---------------- Blood count ---------------- */
  def("hb", "Hemoglobin", "Blood count", "g/dL", { male: [13.5, 17.5], female: [12, 15.5] },
    ["hemoglobin", "haemoglobin", "hb", "hgb"],
    "May point to anemia, for example low iron, vitamin deficiency or blood loss.",
    "Can occur with dehydration, smoking or living at high altitude.",
    { margin: { low: 1, high: 1 }, critical: { low: 7, high: 20 }, plaus: [1, 25], conv: [fac("g/L", 0.1)] }),

  def("rbc", "RBC count", "Blood count", "million/µL", { male: [4.7, 6.1], female: [4.2, 5.4] },
    ["rbc count", "total rbc count", "red blood cell count", "rbc", "erythrocytes"],
    "May go with anemia or a nutritional deficiency.",
    "Can occur with dehydration, smoking or low-oxygen conditions.",
    { plaus: [1, 10] }),

  def("hct", "Hematocrit (PCV)", "Blood count", "%", { male: [41, 53], female: [36, 46] },
    ["hematocrit", "haematocrit", "packed cell volume", "pcv", "hct"],
    "Usually moves with hemoglobin; may point to anemia or extra body fluid.",
    "Can occur with dehydration or smoking.",
    { margin: { low: 3, high: 3 }, plaus: [5, 70] }),

  def("mcv", "MCV", "Blood count", "fL", [80, 100],
    ["mean corpuscular volume", "mcv"],
    "Small red cells; seen with iron deficiency or thalassemia trait.",
    "Large red cells; may go with low B12 or folate, or liver or thyroid issues.",
    { margin: { low: 5, high: 5 }, plaus: [30, 160] }),

  def("mch", "MCH", "Blood count", "pg", [27, 33],
    ["mean corpuscular hemoglobin", "mch"],
    "Less hemoglobin per red cell; often seen with iron deficiency.",
    "More hemoglobin per red cell; may go with low B12 or folate.",
    { margin: { low: 2, high: 2 }, plaus: [10, 60] }),

  def("mchc", "MCHC", "Blood count", "g/dL", [32, 36],
    ["mean corpuscular hemoglobin concentration", "mchc"],
    "Paler red cells; often seen with iron deficiency.",
    "Rarely meaningful alone; can be a lab artefact.",
    { margin: { low: 1, high: 1 }, plaus: [20, 45] }),

  def("wbc", "WBC count", "Blood count", "×10³/µL", [4.5, 11],
    ["total leucocyte count", "total leukocyte count", "white blood cell count", "total wbc count", "wbc count", "wbc", "tlc"],
    "May happen with some infections, medicines or low immunity.",
    "Often seen with infection, inflammation or stress.",
    { margin: { low: 0.5, high: 1.5 }, critical: { low: 2, high: 30 }, plaus: [0, 500],
      conv: [fac("/cumm", 0.001), fac("/µL", 0.001)] }),

  def("neut", "Neutrophils", "Blood count", "%", [40, 70],
    ["segmented neutrophils", "neutrophils", "neutrophil", "polymorphs"],
    "Can follow viral infections or some medicines.",
    "Often seen with bacterial infection or physical stress.",
    { margin: { low: 5, high: 5 }, plaus: [0, 100] }),

  def("lymph", "Lymphocytes", "Blood count", "%", [20, 40],
    ["lymphocytes", "lymphocyte"],
    "May occur with stress, steroid use or some illnesses.",
    "Often seen with viral infections.",
    { margin: { low: 3, high: 5 }, plaus: [0, 100] }),

  def("plt", "Platelets", "Blood count", "×10³/µL", [150, 450],
    ["platelet count", "platelets", "plt"],
    "Low counts can raise bleeding risk; may follow infections like dengue or some medicines.",
    "May occur with iron deficiency, infection or inflammation.",
    { margin: { low: 30, high: 50 }, critical: { low: 20, high: 1000 }, plaus: [0, 3000],
      conv: [fac("lakhs/cumm", 100), fac("/cumm", 0.001)] }),

  def("esr", "ESR", "Blood count", "mm/hr", { male: [0, 15], female: [0, 20] },
    ["erythrocyte sedimentation rate", "esr"],
    "Usually not a concern.",
    "A general sign of inflammation or infection; needs context from your doctor.",
    { margin: { high: 10 }, plaus: [0, 150] }),

  /* ---------------- Diabetes ---------------- */
  def("fbs", "Fasting glucose", "Diabetes", "mg/dL", [70, 99],
    ["fasting blood sugar", "fasting plasma glucose", "fasting glucose", "glucose fasting", "glucose - fasting", "fbs", "fbg"],
    "Low sugar can cause shakiness, sweating and dizziness; may relate to missed meals or diabetes medicines.",
    "100 to 125 is often called prediabetes; 126 or more on repeat tests may point to diabetes.",
    { margin: { low: 5, high: 26 }, critical: { low: 50, high: 400 }, conv: [fac("mmol/L", 18.016)], plaus: [10, 1000] }),

  def("ppbs", "Post-meal glucose (2 hr)", "Diabetes", "mg/dL", [null, 139],
    ["post prandial blood sugar", "postprandial glucose", "post meal glucose", "2 hr glucose", "ppbs", "pp2bs"],
    "Usually not a concern on its own.",
    "140 to 199 suggests impaired glucose tolerance; 200 or more may point to diabetes.",
    { margin: { high: 59 }, critical: { high: 400 }, conv: [fac("mmol/L", 18.016)], plaus: [10, 1000] }),

  def("hba1c", "HbA1c", "Diabetes", "%", [4, 5.6],
    ["glycosylated hemoglobin", "glycated hemoglobin", "glycohemoglobin", "hba1c", "a1c"],
    "Uncommon; can occur with recent blood loss or some types of anemia.",
    "5.7 to 6.4 suggests prediabetes; 6.5 or more may point to diabetes.",
    { margin: { low: 0.5, high: 0.8 }, plaus: [2, 20] }),

  /* ---------------- Lipids ---------------- */
  def("tc", "Total cholesterol", "Lipids", "mg/dL", [null, 199],
    ["total cholesterol", "cholesterol total", "cholesterol - total", "t. cholesterol"],
    "Very low levels are uncommon; may relate to diet, liver or thyroid conditions.",
    "Higher levels raise long-term heart and blood vessel risk.",
    { margin: { high: 40 }, conv: [fac("mmol/L", 38.67)] }),

  def("ldl", "LDL cholesterol", "Lipids", "mg/dL", [null, 99],
    ["ldl cholesterol", "ldl chol", "ldl-c", "ldl"],
    "Usually not a concern.",
    "'Bad' cholesterol; high levels build up in artery walls over time.",
    { margin: { high: 60 }, conv: [fac("mmol/L", 38.67)] }),

  def("vldl", "VLDL cholesterol", "Lipids", "mg/dL", [2, 30],
    ["vldl cholesterol", "vldl"],
    "Usually not a concern.",
    "Rises with high triglycerides, often from sugar, alcohol or excess weight.",
    { margin: { low: 1, high: 10 } }),

  def("hdl", "HDL cholesterol", "Lipids", "mg/dL", { male: [40, null], female: [50, null] },
    ["hdl cholesterol", "hdl chol", "hdl-c", "hdl"],
    "'Good' cholesterol; low levels raise heart risk. Exercise and healthy fats can help.",
    "High HDL is generally not a concern.",
    { margin: { low: 5 }, conv: [fac("mmol/L", 38.67)] }),

  def("tg", "Triglycerides", "Lipids", "mg/dL", [null, 149],
    ["triglycerides", "triglyceride", "s. triglycerides", "tg"],
    "Usually not a concern.",
    "Often linked to sugary or fatty foods, alcohol, weight or diabetes; very high levels can affect the pancreas.",
    { margin: { high: 50 }, critical: { high: 1000 }, conv: [fac("mmol/L", 88.57)], plaus: [0, 5000] }),

  /* ---------------- Liver ---------------- */
  def("alt", "ALT (SGPT)", "Liver", "U/L", [7, 56],
    ["alanine aminotransferase", "alanine transaminase", "alt (sgpt)", "sgpt", "alt"],
    "Usually not a concern.",
    "Can reflect liver irritation from fatty liver, alcohol, infection or some medicines.",
    { margin: { low: 3, high: 30 }, plaus: [0, 5000] }),

  def("ast", "AST (SGOT)", "Liver", "U/L", [10, 40],
    ["aspartate aminotransferase", "aspartate transaminase", "ast (sgot)", "sgot", "ast"],
    "Usually not a concern.",
    "Can come from the liver, but also muscle or heart; read together with ALT.",
    { margin: { low: 3, high: 25 }, plaus: [0, 5000] }),

  def("alp", "ALP", "Liver", "U/L", [44, 147],
    ["alkaline phosphatase", "alk phos", "alp"],
    "May relate to nutrition or some rare conditions.",
    "Can reflect liver or bile duct issues, bone growth or bone disease.",
    { margin: { low: 10, high: 30 } }),

  def("tbil", "Total bilirubin", "Liver", "mg/dL", [0.1, 1.2],
    ["total bilirubin", "bilirubin total", "bilirubin (total)", "t. bilirubin"],
    "Usually not a concern.",
    "May cause yellow skin or eyes; can relate to the liver, bile ducts or red cell breakdown.",
    { margin: { low: 0.1, high: 0.5 }, conv: [fac("µmol/L", 1 / 17.1)], plaus: [0, 60] }),

  def("alb", "Albumin", "Liver", "g/dL", [3.5, 5],
    ["serum albumin", "albumin"],
    "May relate to liver or kidney disease, poor nutrition or inflammation.",
    "Usually from dehydration.",
    { margin: { low: 0.4, high: 0.5 } }),

  def("tp", "Total protein", "Liver", "g/dL", [6, 8.3],
    ["serum total protein", "total protein", "protein total"],
    "May relate to liver or kidney conditions or poor nutrition.",
    "Can occur with dehydration or long-term inflammation.",
    { margin: { low: 0.5, high: 0.5 } }),

  /* ---------------- Kidney ---------------- */
  def("cr", "Creatinine", "Kidney", "mg/dL", { male: [0.74, 1.35], female: [0.59, 1.04] },
    ["serum creatinine", "s. creatinine", "creatinine"],
    "Can reflect low muscle mass; usually not a concern.",
    "May mean the kidneys are filtering less well, or dehydration or high muscle mass.",
    { margin: { low: 0.1, high: 0.3 }, conv: [fac("µmol/L", 1 / 88.4)], plaus: [0, 25] }),

  def("bun", "Blood urea nitrogen (BUN)", "Kidney", "mg/dL", [7, 20],
    ["blood urea nitrogen", "urea nitrogen", "bun"],
    "May relate to low protein intake or over-hydration.",
    "Can occur with dehydration, high protein intake or reduced kidney function.",
    { margin: { low: 2, high: 5 } }),

  /* Indian labs usually print "Blood Urea", which is NOT the same number as BUN. */
  def("urea", "Blood urea", "Kidney", "mg/dL", [15, 40],
    ["blood urea", "serum urea", "urea"],
    "May relate to low protein intake or over-hydration.",
    "Can occur with dehydration, high protein intake or reduced kidney function.",
    { margin: { low: 3, high: 10 }, conv: [fac("mmol/L", 6.006)] }),

  def("ua", "Uric acid", "Kidney", "mg/dL", { male: [3.4, 7], female: [2.4, 6] },
    ["serum uric acid", "s. uric acid", "uric acid"],
    "Usually not a concern.",
    "Can lead to gout or kidney stones; linked to diet, alcohol and weight.",
    { margin: { low: 0.5, high: 1 }, conv: [fac("µmol/L", 1 / 59.48)] }),

  /* ---------------- Electrolytes ---------------- */
  def("na", "Sodium", "Electrolytes", "mmol/L", [135, 145],
    ["serum sodium", "s. sodium", "sodium", "na+"],
    "Can come from fluid overload, some medicines, vomiting or diarrhea.",
    "Often from dehydration.",
    { margin: { low: 3, high: 3 }, critical: { low: 120, high: 160 }, plaus: [80, 200] }),

  def("k", "Potassium", "Electrolytes", "mmol/L", [3.5, 5.1],
    ["serum potassium", "s. potassium", "potassium", "k+"],
    "Can cause weakness and heart rhythm changes; may come from vomiting, diarrhea or water tablets.",
    "Can affect heart rhythm; may relate to kidney problems or some medicines.",
    { margin: { low: 0.3, high: 0.4 }, critical: { low: 2.5, high: 6 }, plaus: [1, 10] }),

  def("cl", "Chloride", "Electrolytes", "mmol/L", [98, 107],
    ["serum chloride", "s. chloride", "chloride", "cl-"],
    "Often changes together with sodium; may follow vomiting or fluid imbalance.",
    "Often changes together with sodium; may follow dehydration.",
    { margin: { low: 3, high: 3 }, plaus: [60, 140] }),

  def("ca", "Calcium", "Electrolytes", "mg/dL", [8.5, 10.5],
    ["serum calcium", "total calcium", "s. calcium", "calcium"],
    "May relate to low vitamin D, parathyroid or kidney issues.",
    "May relate to an overactive parathyroid, too much vitamin D or other conditions.",
    { margin: { low: 0.4, high: 0.4 }, critical: { low: 6.5, high: 13 }, conv: [fac("mmol/L", 4.008)], plaus: [3, 20] }),

  /* ---------------- Thyroid ---------------- */
  def("tsh", "TSH", "Thyroid", "mIU/L", [0.4, 4],
    ["thyroid stimulating hormone", "thyrotropin", "tsh"],
    "May point to an overactive thyroid.",
    "May point to an underactive thyroid.",
    { margin: { low: 0.1, high: 1.5 }, conv: [fac("µIU/mL", 1)], plaus: [0, 200] }),

  def("t3", "T3 (total)", "Thyroid", "ng/dL", [80, 200],
    ["triiodothyronine", "total t3", "t3 total", "t3"],
    "Can go with an underactive thyroid or general illness.",
    "Can go with an overactive thyroid.",
    { margin: { low: 10, high: 20 }, conv: [fac("ng/mL", 100)] }),

  def("t4", "T4 (total)", "Thyroid", "µg/dL", [5, 12],
    ["thyroxine", "total t4", "t4 total", "t4"],
    "Can go with an underactive thyroid.",
    "Can go with an overactive thyroid.",
    { margin: { low: 0.5, high: 1 } }),

  /* ---------------- Vitamins & iron ---------------- */
  def("vitd", "Vitamin D", "Vitamins & iron", "ng/mL", [30, 100],
    ["25 hydroxy vitamin d", "25(oh) vitamin d", "25-oh vitamin d", "vitamin d total", "vitamin d", "vit d"],
    "Common in India; can cause tiredness and bone or muscle aches. Sunlight and diet help; ask your doctor about supplements.",
    "Usually from too many supplements.",
    { margin: { low: 10, high: 0 }, conv: [fac("nmol/L", 1 / 2.496)] }),

  def("b12", "Vitamin B12", "Vitamins & iron", "pg/mL", [200, 900],
    ["vitamin b12", "cyanocobalamin", "vit b12", "b12"],
    "Can cause tiredness, tingling or anemia; may relate to diet or absorption.",
    "Often from supplements; sometimes seen with liver conditions.",
    { margin: { low: 50, high: 200 }, conv: [fac("pmol/L", 1.355)] }),

  def("ferritin", "Ferritin", "Vitamins & iron", "ng/mL", { male: [24, 336], female: [11, 307] },
    ["serum ferritin", "ferritin"],
    "Suggests low iron stores.",
    "Can be raised by inflammation, liver issues or iron overload.",
    { margin: { low: 5, high: 60 }, plaus: [0, 20000] }),

  def("iron", "Serum iron", "Vitamins & iron", "µg/dL", [60, 170],
    ["serum iron", "iron, serum", "s. iron"],
    "May go with iron deficiency.",
    "Can come from iron supplements or iron overload.",
    { margin: { low: 15, high: 30 } }),

  /* ---------------- Inflammation ---------------- */
  def("crp", "CRP", "Inflammation", "mg/L", [null, 4.9],
    ["c-reactive protein", "c reactive protein", "hs-crp", "hscrp", "crp"],
    "Usually not a concern.",
    "Signals inflammation or infection somewhere in the body; needs context.",
    { margin: { high: 5 }, plaus: [0, 500] }),

  /* ---------------- Vitals ---------------- */
  /* Systolic + diastolic are judged TOGETHER by judgeBP(); see engine.js */
  def("bp_sys", "Blood pressure (systolic)", "Vitals", "mmHg", [null, 119],
    ["systolic", "blood pressure", "bp"], "", "", { special: "bp", plaus: [40, 300] }),
  def("bp_dia", "Blood pressure (diastolic)", "Vitals", "mmHg", [null, 79],
    ["diastolic"], "", "", { special: "bp", plaus: [20, 200] }),

  def("pulse", "Pulse", "Vitals", "bpm", [60, 100],
    ["pulse rate", "heart rate", "pulse"],
    "A slow pulse can be normal in athletes; with dizziness or fainting, seek advice.",
    "Can occur with stress, fever, caffeine, anemia or heart rhythm problems.",
    { margin: { low: 5, high: 10 }, critical: { low: 40, high: 130 }, plaus: [20, 250] }),

  def("spo2", "SpO2", "Vitals", "%", [95, 100],
    ["oxygen saturation", "o2 saturation", "spo2"],
    "Low oxygen can be serious, especially with breathlessness; seek medical care.",
    "",
    { margin: { low: 2 }, critical: { low: 90 }, plaus: [50, 100] }),

  def("temp", "Body temperature", "Vitals", "°F", [97, 99],
    ["body temperature", "temperature", "temp"],
    "Low body temperature can come from cold exposure or illness.",
    "Fever often means the body is fighting an infection.",
    { margin: { low: 1, high: 1.5 }, critical: { low: 95, high: 104 }, plaus: [85, 115],
      conv: [{ unit: "°C", toBase: (c) => (c * 9) / 5 + 32, fromBase: (f) => ((f - 32) * 5) / 9 }] }),

  /* ---------------- Body ---------------- */
  /* BMI is calculated from height and weight. Ranges here are the Asian cut-offs.
     engine.js switches to the global cut-offs when profile.asian === false. */
  def("bmi", "BMI (calculated)", "Body", "kg/m²", [18.5, 22.9],
    ["body mass index", "bmi"],
    "Below the healthy range; may relate to nutrition or an underlying condition.",
    "Above the healthy range; raises long-term risk of diabetes, heart and joint problems.",
    { calc: true, margin: { low: 1.5, high: 2 }, plaus: [8, 80] }),
];

/* Inputs used to calculate BMI (not judged on their own) */
const BODY_INPUTS = [
  { id: "height_cm", name: "Height", unit: "cm", plaus: [50, 250] },
  { id: "weight_kg", name: "Weight", unit: "kg", plaus: [10, 400] },
];

const PARAM_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p]));