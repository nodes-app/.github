#!/usr/bin/env node
// Generates profile/assets/star-history{,-dark}.svg from the GitHub stargazer
// API so the org README never depends on a third-party chart service.
// Requires GITHUB_TOKEN. Usage: node scripts/generate-star-chart.mjs

import { writeFileSync } from "node:fs";

const REPO = "nodes-app/swift-markdown-engine";
const OUT_DIR = new URL("../profile/assets/", import.meta.url).pathname;

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

async function fetchStarDates() {
  const dates = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/stargazers?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github.star+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status} on page ${page}`);
    const batch = await res.json();
    if (batch.length === 0) break;
    for (const s of batch) dates.push(new Date(s.starred_at).getTime());
    if (batch.length < 100) break;
  }
  return dates.sort((a, b) => a - b);
}

function niceCeil(n) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(n, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= n) return m * pow;
  }
  return 10 * pow;
}

function renderSvg(dates, { line, text, grid }) {
  const W = 600;
  const H = 340;
  const M = { top: 36, right: 20, bottom: 40, left: 52 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const t0 = dates[0];
  const t1 = Date.now();
  const yMax = niceCeil(dates.length * 1.05);
  const x = (t) => M.left + ((t - t0) / (t1 - t0)) * iw;
  const y = (c) => M.top + ih - (c / yMax) * ih;

  // Downsample the cumulative curve to keep the path small.
  const step = Math.max(1, Math.floor(dates.length / 240));
  const pts = [];
  for (let i = 0; i < dates.length; i += step) {
    pts.push([x(dates[i]), y(i + 1)]);
  }
  pts.push([x(t1), y(dates.length)]);
  const path = pts
    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");

  const yTicks = [];
  const yStep = yMax / 4;
  for (let v = 0; v <= yMax; v += yStep) {
    yTicks.push(
      `<line x1="${M.left}" y1="${y(v)}" x2="${W - M.right}" y2="${y(v)}" stroke="${grid}" stroke-width="1"/>` +
        `<text x="${M.left - 8}" y="${y(v) + 4}" text-anchor="end" fill="${text}" font-size="11">${v}</text>`,
    );
  }

  const xTicks = [];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; i <= 4; i++) {
    const t = t0 + ((t1 - t0) * i) / 4;
    const d = new Date(t);
    const label = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    const anchor = i === 4 ? "end" : "middle";
    xTicks.push(
      `<text x="${x(t)}" y="${H - M.bottom + 20}" text-anchor="${anchor}" fill="${text}" font-size="11">${label}</text>`,
    );
  }

  const [ex, ey] = pts[pts.length - 1];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Star history for ${REPO}: ${dates.length} stars">
  <g font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
    <text x="${M.left}" y="20" fill="${text}" font-size="12">${REPO}</text>
    <text x="${W - M.right}" y="20" text-anchor="end" fill="${line}" font-size="12" font-weight="600">${dates.length} stars</text>
    ${yTicks.join("\n    ")}
    ${xTicks.join("\n    ")}
    <path d="${path}" fill="none" stroke="${line}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5" fill="${line}"/>
  </g>
</svg>
`;
}

const dates = await fetchStarDates();
if (dates.length === 0) throw new Error("no stargazers returned");

writeFileSync(
  `${OUT_DIR}star-history.svg`,
  renderSvg(dates, { line: "#000000", text: "#57606a", grid: "#d0d7de" }),
);
writeFileSync(
  `${OUT_DIR}star-history-dark.svg`,
  renderSvg(dates, { line: "#ffffff", text: "#8b949e", grid: "#30363d" }),
);
console.log(`wrote star-history SVGs (${dates.length} stars)`);
