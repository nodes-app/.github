#!/usr/bin/env node
// Draws profile/assets/star-history{,-dark}.svg from profile/data/star-history.json,
// appending today's star count to that series first.
//
// The series is a running record rather than a fresh fetch of every stargazer,
// because the starred_at timestamps live behind an endpoint that needs a token
// with access to the engine repo. A workflow in this repo only gets a token
// scoped to this repo, so that fetch answered 403 every week. The plain repo
// endpoint used here is public and needs no credentials at all.
//
// Usage: node scripts/generate-star-chart.mjs

import { readFileSync, writeFileSync } from "node:fs";

const REPO = "nodes-app/swift-markdown-engine";
const OUT_DIR = new URL("../profile/assets/", import.meta.url).pathname;
const DATA_FILE = new URL("../profile/data/star-history.json", import.meta.url)
  .pathname;

/** Today as YYYY-MM-DD, UTC, matching the seeded sample dates. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Current stargazer count. Unauthenticated: the shared runner IPs make that
 * rate limit worth retrying against, but one request a week is well inside it.
 */
async function fetchStarCount() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (res.ok) {
        const { stargazers_count: count } = await res.json();
        if (typeof count !== "number") throw new Error("no stargazers_count");
        return count;
      }
      lastError = new Error(
        `GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    } catch (err) {
      lastError = err;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  throw lastError;
}

/** Samples one per line: a weekly one-line diff beats a 300-line reflow. */
function serialize(data) {
  const rows = data.samples
    .map(([day, count]) => `    ["${day}", ${count}]`)
    .join(",\n");
  return `{
  "repo": ${JSON.stringify(data.repo)},
  "note": ${JSON.stringify(data.note)},
  "samples": [
${rows}
  ]
}
`;
}

function niceCeil(n) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(n, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= n) return m * pow;
  }
  return 10 * pow;
}

function renderSvg(samples, { line, text, grid }) {
  const W = 600;
  const H = 340;
  const M = { top: 36, right: 20, bottom: 40, left: 52 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const at = (s) => Date.parse(`${s[0]}T00:00:00Z`);
  const t0 = at(samples[0]);
  const t1 = at(samples[samples.length - 1]);
  const total = samples[samples.length - 1][1];
  const yMax = niceCeil(total * 1.05);

  // A single sample would make the x scale divide by zero; fall back to a flat
  // line across the plot rather than emitting NaN coordinates.
  const span = t1 - t0 || 1;
  const x = (t) => M.left + ((t - t0) / span) * iw;
  const y = (c) => M.top + ih - (c / yMax) * ih;

  const pts = samples.map((s) => [x(at(s)), y(s[1])]);
  const path = pts
    .map(
      ([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`,
    )
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
    const t = t0 + (span * i) / 4;
    const d = new Date(t);
    const label = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    const anchor = i === 0 ? "start" : i === 4 ? "end" : "middle";
    xTicks.push(
      `<text x="${x(t)}" y="${H - M.bottom + 20}" text-anchor="${anchor}" fill="${text}" font-size="11">${label}</text>`,
    );
  }

  const [ex, ey] = pts[pts.length - 1];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Star history for ${REPO}: ${total} stars">
  <g font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
    <text x="${M.left}" y="20" fill="${text}" font-size="12">${REPO}</text>
    <text x="${W - M.right}" y="20" text-anchor="end" fill="${line}" font-size="12" font-weight="600">${total} stars</text>
    ${yTicks.join("\n    ")}
    ${xTicks.join("\n    ")}
    <path d="${path}" fill="none" stroke="${line}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5" fill="${line}"/>
  </g>
</svg>
`;
}

const data = JSON.parse(readFileSync(DATA_FILE, "utf8"));
if (!Array.isArray(data.samples) || data.samples.length === 0) {
  throw new Error("star-history.json has no samples to draw");
}

const count = await fetchStarCount();
const day = today();
const last = data.samples[data.samples.length - 1];

if (last[0] === day) {
  last[1] = count;
} else {
  data.samples.push([day, count]);
}

writeFileSync(DATA_FILE, serialize(data));
writeFileSync(
  `${OUT_DIR}star-history.svg`,
  renderSvg(data.samples, { line: "#000000", text: "#57606a", grid: "#d0d7de" }),
);
writeFileSync(
  `${OUT_DIR}star-history-dark.svg`,
  renderSvg(data.samples, { line: "#ffffff", text: "#8b949e", grid: "#30363d" }),
);
console.log(`wrote star-history SVGs (${count} stars, ${data.samples.length} samples)`);
