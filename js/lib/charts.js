/* Shared Chart.js styling.
   The palette is ordered and fixed so a category keeps the same colour in
   every chart on every page — Labor is always brass, Materials always
   blueprint. Anything drawing a chart should go through here rather than
   passing its own colours, or that guarantee quietly breaks. */

export const PALETTE = [
  "#2B5F8C", // c1 blueprint — materials
  "#A87B3F", // c2 brass — labor
  "#2F6B4F", // c3 green
  "#A6432E", // c4 rust
  "#B8801F", // c5 amber
  "#6E9BBF", // c6 blueprint light
  "#C9A470", // c7 brass light
  "#9A9DA3", // c8 concrete
];

export const TONE = {
  blueprint: "#2B5F8C",
  brass: "#A87B3F",
  green: "#2F6B4F",
  rust: "#A6432E",
  amber: "#B8801F",
};

const GRID = "#F2F0E9";
const TICK = "#5A5F68";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const rupee = (v) => "₹" + Number(v).toLocaleString("en-IN");

/** Legends sit bottom-left, with small round swatches. */
function legend(display) {
  return {
    display,
    position: "bottom",
    align: "start",
    labels: {
      font: { size: 11, family: "Inter, system-ui, sans-serif" },
      boxWidth: 7,
      boxHeight: 7,
      usePointStyle: true,
      pointStyle: "circle",
      padding: 14,
      color: "#3A4256",
    },
  };
}

function tooltip() {
  return {
    backgroundColor: "#1C2333",
    padding: 10,
    cornerRadius: 10,
    titleFont: { size: 11, family: "Inter, system-ui, sans-serif" },
    bodyFont: { size: 12, family: MONO },
    displayColors: false,
    callbacks: { label: (c) => rupee(c.parsed.y ?? c.parsed.x ?? c.parsed) },
  };
}

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: legend(false), tooltip: tooltip() },
    scales: {
      x: { grid: { display: false }, border: { color: GRID }, ticks: { font: { size: 10, family: MONO }, color: TICK } },
      y: {
        grid: { color: GRID, drawTicks: false },
        border: { display: false },
        ticks: { font: { size: 10, family: MONO }, color: TICK, padding: 8, callback: rupee },
      },
    },
  };
}

export function doughnutChart(canvasId, entries) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  return new Chart(el, {
    type: "doughnut",
    data: {
      labels: entries.map((e) => e.name),
      datasets: [{
        data: entries.map((e) => e.value),
        backgroundColor: PALETTE,
        borderWidth: 0,
        borderRadius: 4,
        spacing: 2,
        cutout: "62%",
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legend(true), tooltip: tooltip() } },
  });
}

export function barChart(canvasId, labels, series) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  const opts = baseOptions();
  if (series.length > 1) opts.plugins.legend = legend(true);
  return new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: s.data,
        backgroundColor: s.color || PALETTE[i % PALETTE.length],
        borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
        maxBarThickness: 46,
      })),
    },
    options: opts,
  });
}

/** Horizontal stacked bars — used for cost-by-phase (labor vs materials). */
export function stackedBarChart(canvasId, labels, series) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  return new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: s.data,
        backgroundColor: s.color || PALETTE[i % PALETTE.length],
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 26,
      })),
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: legend(true), tooltip: tooltip() },
      scales: {
        x: {
          stacked: true,
          grid: { color: GRID, drawTicks: false },
          border: { display: false },
          ticks: { font: { size: 10, family: MONO }, color: TICK, callback: rupee },
        },
        y: {
          stacked: true,
          grid: { display: false },
          border: { color: GRID },
          ticks: { font: { size: 11, family: "Inter, system-ui, sans-serif" }, color: TICK },
        },
      },
    },
  });
}

export function lineChart(canvasId, labels, data) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  return new Chart(el, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Spending",
        data,
        borderColor: TONE.brass,
        backgroundColor: "rgba(168,123,63,0.08)",
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: "#fff",
        pointBorderColor: TONE.brass,
        pointBorderWidth: 2,
        fill: true,
      }],
    },
    options: baseOptions(),
  });
}
