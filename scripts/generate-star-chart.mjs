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
// The chart is drawn as a printed card: it paints Nodes paper and rules its own
// border, so it looks the same whatever colour the page behind it is. GitHub
// loads it as an <img>, which means no script, no external CSS and no web
// fonts - Roboto Mono will not load, so everything is set in the system mono
// stack. There is deliberately no animation either: a draw-on line has no safe
// first frame, and any renderer that rasterises frame zero instead of playing
// the timeline would capture an empty plot.
//
// Usage: node scripts/generate-star-chart.mjs

import { readFileSync, writeFileSync } from "node:fs";

const REPO_OWNER = "nodes-app";
const REPO_NAME = "swift-markdown-engine";
const REPO = `${REPO_OWNER}/${REPO_NAME}`;
const OUT_DIR = new URL("../profile/assets/", import.meta.url).pathname;
const DATA_FILE = new URL("../profile/data/star-history.json", import.meta.url)
  .pathname;

const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

// Light is the Nodes site palette verbatim (--ink / --paper / --red from
// src/style.css). Dark is a chosen counterpart, not an automatic inversion: a
// warm near-black stands in for paper, and the border is softened because
// full-strength ink rings the card in near-white and glares.
const LIGHT = {
  suffix: "",
  paper: "#edeae1",
  ink: "#2b2828",
  muted: "#6b6663",
  hair: "#d6d3cb",
  hairStrong: "#c2beb4",
  border: "#2b2828",
  red: "#d1403f",
};

const DARK = {
  suffix: "-dark",
  paper: "#1b1917",
  ink: "#e9e5dc",
  muted: "#948e87",
  hair: "#3a3633",
  hairStrong: "#4b4642",
  border: "#6d655e",
  red: "#e2605e",
};

/* ------------------------------------------------------------------ series */

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

/* ------------------------------------------------------------------ drawing */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const at = (day) => Date.parse(`${day}T00:00:00Z`);
const dayOf = (day) => new Date(at(day));
const shortDate = (day) => {
  const d = dayOf(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const year = (day) => dayOf(day).getUTCFullYear();
const n = (v) => Number(v.toFixed(2));

/** Advance width of a monospace run. Every face in the stack is 0.6em/char. */
const tw = (s, size) => s.length * size * 0.6;

const toPath = (pts) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${n(x)},${n(y)}`).join(" ");

function render(samples, c) {
  const W = 600;
  const H = 340;
  const pad = 26;
  const total = samples[samples.length - 1][1];
  // Leave the top 8% clear so the curve never touches the header rule.
  const yMax = Math.ceil(total / 0.92 / 50) * 50;

  const box = { x: pad, y: 76, w: W - pad * 2, h: H - 76 - 56 };
  const t0 = at(samples[0][0]);
  const t1 = at(samples[samples.length - 1][0]);
  const span = t1 - t0 || 1;
  const x = (day) => box.x + ((at(day) - t0) / span) * box.w;
  const y = (v) => box.y + box.h - (v / yMax) * box.h;
  const pts = samples.map((s) => [x(s[0]), y(s[1])]);
  const [ex, ey] = pts[pts.length - 1];

  // Gridlines every 250, labelled just above the rule at the far left where
  // the series is still flat on the floor.
  const grid = [];
  for (let v = 250; v < yMax; v += 250) {
    grid.push(
      `<line x1="${box.x}" y1="${n(y(v))}" x2="${box.x + box.w}" y2="${n(y(v))}" stroke="${c.hair}" stroke-width="1"/>`,
      `<text x="${box.x + 2}" y="${n(y(v) - 6)}" fill="${c.muted}" font-size="10">${v}</text>`,
    );
  }

  // The hero number sits in the dead space under the long taper and knocks the
  // gridlines out behind itself.
  const heroX = box.x + 148;
  const heroBaseline = box.y + box.h - 34;
  const heroSize = 46;
  const capBaseline = box.y + box.h - 12;

  const first = samples[0][0];
  const last = samples[samples.length - 1][0];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${REPO} star history: ${total} stars">
  <g font-family="${MONO}" font-size="12">
    <rect x="0" y="0" width="${W}" height="${H}" fill="${c.paper}"/>
    <rect x="6.5" y="6.5" width="${W - 13}" height="${H - 13}" fill="none" stroke="${c.border}" stroke-width="1"/>

    <text x="${pad}" y="${pad + 18}" fill="${c.ink}">[[${REPO_NAME}]]</text>
    <text x="${W - pad}" y="${pad + 18}" text-anchor="end" fill="${c.muted}">github stars</text>
    <line x1="${pad}" y1="${pad + 30}" x2="${W - pad}" y2="${pad + 30}" stroke="${c.hairStrong}" stroke-width="1"/>

    ${grid.join("\n    ")}
    <line x1="${box.x}" y1="${box.y + box.h}" x2="${box.x + box.w}" y2="${box.y + box.h}" stroke="${c.ink}" stroke-width="1"/>

    <rect x="${heroX - 6}" y="${heroBaseline - heroSize}" width="${tw("000", heroSize) + 12}" height="${capBaseline - heroBaseline + heroSize + 6}" fill="${c.paper}"/>
    <text x="${heroX}" y="${heroBaseline}" fill="${c.ink}" font-size="${heroSize}" letter-spacing="-1">${total}</text>
    <text x="${heroX + 2}" y="${capBaseline}" fill="${c.muted}" font-size="11">stars</text>

    <path d="${toPath(pts)}" fill="none" stroke="${c.ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${n(ex)}" cy="${n(ey)}" r="6" fill="${c.paper}"/>
    <circle cx="${n(ex)}" cy="${n(ey)}" r="3.5" fill="${c.red}"/>

    <text x="${pad}" y="${H - pad - 4}" fill="${c.muted}" font-size="11">${shortDate(first)}</text>
    <text x="${W / 2}" y="${H - pad - 4}" text-anchor="middle" fill="${c.muted}" font-size="11">${year(last)}</text>
    <text x="${W - pad}" y="${H - pad - 4}" text-anchor="end" fill="${c.muted}" font-size="11">${shortDate(last)}</text>
  </g>
</svg>
`;
}

/* --------------------------------------------------------------------- main */

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
for (const palette of [LIGHT, DARK]) {
  writeFileSync(
    `${OUT_DIR}star-history${palette.suffix}.svg`,
    render(data.samples, palette),
  );
}
console.log(`wrote star-history SVGs (${count} stars, ${data.samples.length} samples)`);
