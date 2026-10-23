"use strict";
/* ============================================================
   history.js – history.html: saved reports, trend chart with the
   normal range shaded, delete, clear all, export.
   Needs: params.js, engine.js, storage.js (+ Chart.js from CDN).
   ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  const ICON = { ok: "✓", warn: "⚠", bad: "✕" };
  const LABEL = { ok: "Normal", warn: "Borderline", bad: "Abnormal" };
  const LCOL = { ok: "#35d07f", warn: "#ffb020", bad: "#ff4b5c" };
  const dateTxt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No date");

  let reports = [];
  let chart = null;

  /* nav style on scroll */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ======================================================
     SAVED REPORTS LIST
     ====================================================== */
  function renderList() {
    const el = $("#list");
    $("#foot").hidden = reports.length === 0;
    if (!reports.length) {
      el.innerHTML = `<div class="empty"><h3>No saved reports yet</h3>
        <p>Analyze a report, then press “Save report” to see it here.</p>
        <p style="margin-top:16px"><a class="btn btn-primary" href="analyze.html">Add a report</a></p></div>`;
      return;
    }
    el.innerHTML = reports.map((r) => {
      const c = r.counts || { normal: 0, borderline: 0, abnormal: 0 };
      const p = r.profile || {};
      const meta = [dateTxt(r.date), p.age ? `Age ${esc(p.age)}` : "", p.sex === "female" ? "Female" : p.sex === "male" ? "Male" : ""].filter(Boolean).join(" · ");
      const flagged = (r.flagged || []).length ? `<p class="hflag"><b>Check:</b> ${r.flagged.map(esc).join(", ")}</p>` : "";
      return `<article class="hcard">
        <div>
          <h3>${esc(r.name || "Unnamed report")}</h3>
          <p class="hmeta">${meta} · ${esc(r.total || 0)} values</p>
          <div class="hchips">
            <span class="chip ok sm">✓ ${c.normal} Normal</span>
            <span class="chip warn sm">⚠ ${c.borderline} Borderline</span>
            <span class="chip bad sm">✕ ${c.abnormal} Abnormal</span>
          </div>
          ${flagged}
        </div>
        <div class="hact">
          <a class="btn btn-primary" href="analyze.html?report=${encodeURIComponent(r.id)}">Open</a>
          <button type="button" class="btn btn-ghost danger" data-del="${esc(r.id)}" aria-label="Delete report from ${esc(dateTxt(r.date))}">Delete</button>
        </div>
      </article>`;
    }).join("");
  }

  /* ======================================================
     TREND CHART
     ====================================================== */
  /* shades the normal range behind the line */
  const BAND = {
    id: "band",
    beforeDatasetsDraw(chart, _args, opts) {
      if (!opts || (opts.lo == null && opts.hi == null)) return;
      const { ctx, chartArea, scales } = chart;
      const y = scales.y;
      const a = opts.hi != null ? y.getPixelForValue(opts.hi) : chartArea.top;
      const b = opts.lo != null ? y.getPixelForValue(opts.lo) : chartArea.bottom;
      const top = Math.max(chartArea.top, Math.min(a, b));
      const bottom = Math.min(chartArea.bottom, Math.max(a, b));
      if (bottom <= top) return;
      ctx.save();
      ctx.fillStyle = "rgba(53,208,127,.14)";
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
      ctx.strokeStyle = "rgba(53,208,127,.55)";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1;
      [opts.lo, opts.hi].forEach((v) => {
        if (v == null) return;
        const py = y.getPixelForValue(v);
        if (py < chartArea.top || py > chartArea.bottom) return;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
      });
      ctx.restore();
    },
  };

  function seriesFor(id) {
    return reports
      .filter((r) => r.series && r.series[id])
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.savedAt || 0) - (b.savedAt || 0))
      .map((r) => ({ date: r.date, ...r.series[id] }));
  }

  function trendIds() {
    const ids = new Set();
    reports.forEach((r) => Object.keys(r.series || {}).forEach((k) => ids.add(k)));
    const order = PARAMS.map((p) => p.id);
    return [...ids].filter((id) => PARAM_BY_ID[id]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  const rangeTxt = (lo, hi, unit) =>
    lo != null && hi != null ? `${fmt(lo)}–${fmt(hi)} ${unit}` : hi != null ? `up to ${fmt(hi)} ${unit}` : `${fmt(lo)} or above ${unit}`;

  function setupTrend() {
    const ids = trendIds();
    $("#trendBox").hidden = ids.length === 0;
    if (!ids.length) return;
    const sel = $("#trendSel");
    const keep = sel.value;
    sel.innerHTML = ids.map((id) => {
      const n = seriesFor(id).length;
      return `<option value="${id}">${esc(PARAM_BY_ID[id].name)} (${n} report${n > 1 ? "s" : ""})</option>`;
    }).join("");
    /* default: the test with the most saved points */
    const best = ids.slice().sort((a, b) => seriesFor(b).length - seriesFor(a).length)[0];
    sel.value = ids.includes(keep) ? keep : best;
    drawTrend(sel.value);
  }

  function drawTrend(id) {
    const pts = seriesFor(id);
    const p = PARAM_BY_ID[id];
    const note = $("#trendNote"), wrap = $("#chartWrap"), table = $("#ttable");
    if (chart) { chart.destroy(); chart = null; }
    if (!pts.length) return;
    const last = pts[pts.length - 1];

    /* chart */
    if (typeof Chart === "undefined") {
      wrap.hidden = true;
      note.textContent = "The chart library could not load (it needs internet the first time). The table below still works.";
    } else {
      wrap.hidden = false;
      Chart.defaults.color = "#A99CA8";
      Chart.defaults.font.family = "Inter, system-ui, sans-serif";
      const vals = pts.map((x) => x.v);
      let min = Math.min(...vals), max = Math.max(...vals);
      if (last.lo != null) min = Math.min(min, last.lo);
      if (last.hi != null) max = Math.max(max, last.hi);
      const pad = (max - min) * 0.2 || Math.max(1, max * 0.1);
      chart = new Chart($("#trendChart"), {
        type: "line",
        data: {
          labels: pts.map((x) => dateTxt(x.date)),
          datasets: [{
            label: `${p.name} (${p.unit})`,
            data: vals,
            borderColor: "#FF2DA8", backgroundColor: "#FF2DA8",
            borderWidth: 2.5, tension: 0.25,
            pointRadius: 6, pointHoverRadius: 8,
            pointBackgroundColor: pts.map((x) => LCOL[x.lvl] || "#fff"),
            pointBorderColor: "#0B080B", pointBorderWidth: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { min: Math.max(0, min - pad), max: max + pad, title: { display: true, text: p.unit }, grid: { color: "rgba(255,255,255,.07)" } },
            x: { grid: { display: false } },
          },
          plugins: {
            legend: { display: false },
            band: { lo: last.lo, hi: last.hi },
            tooltip: { callbacks: { label: (c) => ` ${fmt(c.parsed.y)} ${p.unit} · ${LABEL[pts[c.dataIndex].lvl] || ""}` } },
          },
        },
        plugins: [BAND],
      });
      note.innerHTML = pts.length < 2
        ? `Only one saved report has this test. Save more reports over time to see a trend.`
        : `Green band = normal range from your latest report (${esc(rangeTxt(last.lo, last.hi, p.unit))}). Dot colour shows the status at that time. Different labs can use different ranges and methods, so compare trends with care.`;
    }

    /* table (latest first) with change since previous report */
    const rows = pts.map((x, i) => ({ x, d: i ? Math.round((x.v - pts[i - 1].v) * 100) / 100 : null })).reverse();
    table.innerHTML = `<thead><tr><th>Date</th><th>Value</th><th>Status</th><th>Change</th></tr></thead><tbody>${rows.map(({ x, d }) =>
      `<tr><td>${esc(dateTxt(x.date))}</td><td>${fmt(x.v)} ${esc(p.unit)}</td>
        <td><span class="chip ${x.lvl} sm">${ICON[x.lvl] || ""} ${LABEL[x.lvl] || ""}</span></td>
        <td class="delta">${d == null ? "–" : d > 0 ? "▲ +" + fmt(d) : d < 0 ? "▼ " + fmt(d) : "no change"}</td></tr>`).join("")}</tbody>`;
  }

  /* ======================================================
     LOAD + EVENTS
     ====================================================== */
  function load() {
    reports = Store.list();
    renderList();
    setupTrend();
  }

  $("#trendSel").addEventListener("change", (e) => drawTrend(e.target.value));

  $("#list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    if (!confirm("Delete this saved report from this device? This cannot be undone.")) return;
    Store.remove(b.dataset.del);
    load();
  });

  $("#exportBtn").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([Store.exportJSON()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lablens-history.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $("#clearAllBtn").addEventListener("click", () => {
    if (!confirm("Delete ALL saved reports from this device? This cannot be undone.")) return;
    Store.clear();
    load();
  });

  if (!Store.available()) {
    const m = $("#storeMsg");
    m.hidden = false;
    m.textContent = "Your browser is blocking local storage (private mode?), so reports cannot be saved or shown here.";
  }
  load();
})();