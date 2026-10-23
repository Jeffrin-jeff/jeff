"use strict";
/* ============================================================
   extract.js – PDF / image / pasted text  →  parameter values.
   Needs params.js + engine.js. pdf.js and Tesseract.js load
   only when needed. To self-host them later, change LIBS.
   ============================================================ */
const Extract = (() => {
  const LIBS = {
    pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  };
  const MAX_OCR_PAGES = 5;

  /* ---------- load a script once ---------- */
  const loaded = {};
  function loadScript(src) {
    return (loaded[src] ||= new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => { delete loaded[src]; rej(new Error("Could not load the reading engine. Check your internet connection (needed the first time).")); };
      document.head.appendChild(s);
    }));
  }

  /* ======================================================
     1. READ FILES
     ====================================================== */
  function linesFromItems(items) {
    const rows = [];
    items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, s: it.str });
    });
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ")).join("\n");
  }

  /* grayscale + contrast stretch + sensible size: helps OCR on phone photos */
  function prepCanvas(src, w, h) {
    const long = Math.max(w, h);
    let s = 1;
    if (long > 2400) s = 2400 / long;
    else if (long < 1600) s = Math.min(2, 1600 / long);
    const c = document.createElement("canvas");
    c.width = Math.round(w * s);
    c.height = Math.round(h * s);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      d[i] = y; hist[y]++;
    }
    const total = c.width * c.height;
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.02) { hi = i; break; } }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, (((d[i] - lo) * 255) / span) | 0));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ---------- OCR ---------- */
  let worker = null, ocrCb = null;
  async function getWorker(report) {
    if (worker) return worker;
    await loadScript(LIBS.tesseract);
    report("Loading the text reader (first time only)…", 8);
    worker = await Tesseract.createWorker("eng", 1, {
      logger: (m) => { if (m.status === "recognizing text" && ocrCb) ocrCb(m.progress); },
    });
    return worker;
  }
  async function ocr(canvas, report, base, span, label) {
    const w = await getWorker(report);
    ocrCb = (p) => report(`${label} ${Math.round(p * 100)}%`, base + p * span);
    const { data } = await w.recognize(canvas);
    ocrCb = null;
    return data.text || "";
  }
  async function dispose() {
    if (worker) { try { await worker.terminate(); } catch {} worker = null; }
  }

  async function fromPDF(file, report) {
    await loadScript(LIBS.pdfjs);
    pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const buf = new Uint8Array(await file.arrayBuffer());
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    } catch (e) {
      if (e && e.name === "PasswordException") throw new Error("This PDF is password protected. Remove the password and try again.");
      throw new Error("This PDF could not be opened.");
    }
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      report(`Reading page ${i} of ${pdf.numPages}…`, (i / pdf.numPages) * 40);
      const page = await pdf.getPage(i);
      text += (await page.getTextContent()).items.length ? linesFromItems((await page.getTextContent()).items) + "\n" : "";
    }
    if (text.replace(/\s/g, "").length >= 40) return { text, source: "pdf" };

    /* no text layer: it is a scan, so render pages and OCR them */
    const n = Math.min(pdf.numPages, MAX_OCR_PAGES);
    let out = "";
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2 });
      const cv = document.createElement("canvas");
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      const prepped = prepCanvas(cv, cv.width, cv.height);
      out += (await ocr(prepped, report, 10 + ((i - 1) / n) * 90, 90 / n, `Scanning page ${i} of ${n}…`)) + "\n";
    }
    return { text: out, source: "ocr" };
  }

  async function fromImage(file, report) {
    report("Preparing the image…", 5);
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { try { bmp = await createImageBitmap(file); } catch { throw new Error("This image could not be opened."); } }
    const canvas = prepCanvas(bmp, bmp.width, bmp.height);
    if (bmp.close) bmp.close();
    const text = await ocr(canvas, report, 10, 90, "Reading the image…");
    return { text, source: "ocr" };
  }

  function fromFile(file, report = () => {}) {
    return file.type === "application/pdf" ? fromPDF(file, report) : fromImage(file, report);
  }

  /* ======================================================
     2. PARSER
     ====================================================== */
  /* extra spellings that real reports use */
  const EXTRA = {
    hba1c: ["hemoglobin a1c", "haemoglobin a1c", "hb a1c", "glyco hemoglobin", "glycated hb"],
    fbs: ["fasting blood glucose", "glucose, fasting", "glucose (fasting)", "blood sugar fasting", "blood sugar (fasting)", "blood sugar - fasting"],
    ppbs: ["blood sugar pp", "blood sugar post prandial", "glucose post prandial", "glucose (pp)", "glucose pp", "postprandial", "post prandial"],
    wbc: ["total wbc", "wbc total"],
    plt: ["platelet", "platelets count"],
  };
  Object.entries(EXTRA).forEach(([id, list]) =>
    list.forEach((a) => { const p = PARAM_BY_ID[id]; if (p && !p.aliases.includes(a)) p.aliases.push(a); })
  );

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ALIASES = [];
  PARAMS.forEach((p) =>
    p.aliases.forEach((a) => {
      if (p.special === "bp" && (a === "blood pressure" || a === "bp")) return; // handled by BP_RE
      ALIASES.push({ a, p, re: new RegExp("(?<![a-z0-9])" + escapeRe(a) + "(?![a-z0-9])", "i") });
    })
  );
  ALIASES.sort((x, y) => y.a.length - x.a.length);

  const NUM_RE = /(?<![a-z0-9.])(\d+(?:\.\d+)?)(?![a-z0-9])(?!\.\d)/i;
  const BP_RE = /(?:blood pressure|\bbp\b)[^0-9\n]{0,15}(\d{2,3})\s*[\/\\]\s*(\d{2,3})/i;

  /* normalise a unit string so "gm/dl", "G/DL" and "g/dL" all match */
  const nu = (s) =>
    s.toLowerCase()
      .replace(/[µμ]/g, "u").replace(/[\s.]/g, "").replace(/^[×x](?=10)/, "")
      .replace(/10\^?3|10³|10e3|10\*3|thousand|thou/g, "k")
      .replace(/millions?|mill?|10\^?6|10⁶|10e6|10\*6/g, "m")
      .replace(/cumm|cmm|cu\/mm|mm3|mm³/g, "cumm")
      .replace(/(k|m)\/(?:ul|cumm)/g, "$1/ul")
      .replace(/lakhs?|lacs?/g, "lakhs")
      .replace(/^(?:cells?|per)(?=\/)/, "").replace(/^cumm/, "/cumm")
      .replace(/^gms?\//, "g/").replace(/^mcg/, "ug").replace(/^iu\/l/, "u/l")
      .replace(/mm\/(?:1sthr|1sthour|hour|hr|h)/, "mm/hr");

  /* fix common OCR slips only inside number-like tokens (O→0, l→1, 13,2→13.2) */
  function fixDigits(l) {
    return l.replace(/\b(?=[\dOolI]*\d)[\dOolI]+(?:[.,][\dOolI]+)?\b/g, (t) =>
      t.replace(/[Oo]/g, "0").replace(/[lI]/g, "1").replace(/^(\d+),(\d{1,2})$/, "$1.$2"));
  }
  function cleanLine(l, ocr) {
    l = l.replace(/[–—−]/g, "-").replace(/[_.]{3,}/g, " ").replace(/\s+/g, " ").trim();
    if (ocr) l = fixDigits(l);
    return l.replace(/(\d),(\d{3})(?!\d)/g, "$1$2"); // 7,200 → 7200
  }

  function matchUnit(p, tail) {
    const cands = [{ k: nu(p.unit), u: p.unit }];
    (p.conv || []).forEach((c) => cands.push({ k: nu(c.unit), u: c.unit }));
    if (p.id === "temp") cands.push({ k: "f", u: "°F" }, { k: "degf", u: "°F" }, { k: "c", u: "°C" }, { k: "degc", u: "°C" });
    cands.sort((a, b) => b.k.length - a.k.length);
    const clean = tail.replace(/^[\s*:|]+/, "").replace(/^[HLhl*]\s+/, "");
    const t = nu(clean).slice(0, 24);
    const hit = cands.find((c) => t.startsWith(c.k));
    if (hit) return { unit: hit.u };
    const w = /^[a-zµμ%°][a-zµμ%°\/]*/i.exec(clean);
    if (w && !/^(h|l|high|low|normal|abnormal|critical|nil|desirable|optimal|borderline|method|ref|reference|range|bio|biological)$/i.test(w[0]))
      return { unknown: w[0] };
    return {};
  }

  function findRef(s) {
    let m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(s);
    if (m) return `${m[1]}–${m[2]}`;
    m = /([<>]=?|≤|≥)\s*(\d+(?:\.\d+)?)/.exec(s);
    return m ? `${m[1]}${m[2]}` : "";
  }

  function makeRow(p, value, ui, ref, ocr) {
    const reasons = [];
    let unit = ui.unit || p.unit;
    if (!ui.unit) {
      if (ui.unknown) reasons.push(`Unit "${ui.unknown}" not recognised, assumed ${p.unit}.`);
      else if (ocr) reasons.push(`Unit not found, assumed ${p.unit}.`);
      const [mn, mx] = plausRange(p);
      if (!p.special && (value < mn || value > mx)) {
        for (const c of p.conv || []) {
          const b = c.toBase(value);
          if (b >= mn && b <= mx) { unit = c.unit; reasons.push(`Unit guessed as ${c.unit} from the size of the number.`); break; }
        }
      }
    }
    try {
      if (validateValue(p, toBase(p, value, unit)).warning) reasons.push("This value looks unusual. Check the digits and unit.");
    } catch {}
    return { id: p.id, name: p.name, value, unit, units: [p.unit, ...(p.conv || []).map((c) => c.unit)], ref, reasons, check: reasons.length > 0 };
  }

  function findProfile(text) {
    const t = text.replace(/\s+/g, " ");
    let age = null, sex = null, m;
    m = /\bage\b\s*(?:\/\s*(?:sex|gender))?\s*[:\-]?\s*(\d{1,3})\s*(?:years?|yrs?|y)?\b\s*[\/,\-]?\s*(male|female|m|f)?\b/i.exec(t);
    if (m) { age = +m[1]; if (m[2]) sex = /^f/i.test(m[2]) ? "female" : "male"; }
    if (!sex) {
      m = /\b(?:sex|gender)\b\s*[:\-]?\s*(male|female|m|f)\b/i.exec(t) || /\b(female|male)\b/i.exec(t);
      if (m) sex = /^f/i.test(m[1]) ? "female" : "male";
    }
    return { age: age > 0 && age <= 120 ? age : null, sex };
  }

  function parse(text, source) {
    const ocr = source === "ocr";
    const lines = text.split(/\r?\n/).map((l) => cleanLine(l, ocr)).filter((l) => l.length > 2);
    const found = {};

    lines.forEach((line) => {
      const bp = BP_RE.exec(line);
      if (bp) {
        [["bp_sys", +bp[1]], ["bp_dia", +bp[2]]].forEach(([id, v]) => {
          if (!found[id]) found[id] = makeRow(PARAM_BY_ID[id], v, { unit: "mmHg" }, "", ocr);
        });
        return;
      }
      if (/\bratio\b/i.test(line)) return;

      let best = null;
      for (const al of ALIASES) {
        const m = al.re.exec(line);
        if (m && (!best || al.a.length > best.al.a.length)) best = { al, m };
      }
      if (!best) return;
      const p = best.al.p;
      if (found[p.id]) return;
      if ((p.id === "neut" || p.id === "lymph") && /absolute|\babs\b/i.test(line)) return;

      const rest = line.slice(best.m.index + best.m[0].length).replace(/^\s*\([^)\d]{0,14}\)/, "");
      const nm = NUM_RE.exec(rest);
      if (!nm || nm.index > 60) return;
      const after = rest.slice(nm.index + nm[0].length);
      found[p.id] = makeRow(p, parseFloat(nm[1]), matchUnit(p, after), findRef(after), ocr);
    });

    const rows = PARAMS.map((p) => found[p.id]).filter(Boolean);
    return { rows, profile: findProfile(text), linesRead: lines.length };
  }

  return { fromFile, parse, dispose };
})();