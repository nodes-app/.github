#!/usr/bin/env node
// Draws profile/assets/star-history.svg from profile/data/star-history.json,
// appending today's star count to that series first (STAR_OFFLINE=1 skips the
// fetch and only draws).
//
// The series is a running record rather than a fresh fetch of every stargazer,
// because the starred_at timestamps live behind an endpoint that needs a token
// with access to the engine repo. A workflow in this repo only gets a token
// scoped to this repo, so that fetch answered 403 every week. The plain repo
// endpoint used here is public and needs no credentials at all.
//
// The chart is drawn in the Werk 42 CI (github.com/nodes-app/werk42-ci): a plain
// line chart on its paper, in its ink, its last point in an ochre of the
// engine's line of the picture (line 39), whose band stands over it in the
// README. It paints its own paper, so it reads the same on a light or a dark page.
// GitHub loads it as an <img>: no script and no fonts from elsewhere, so IBM Plex
// Mono comes along as a small embedded subset (scripts/plex-mono-subset.woff2,
// OFL, scripts/OFL-IBMPlexMono.txt). No animation: a renderer that rasterises
// frame zero would capture an empty plot.
//
// Usage: node scripts/generate-star-chart.mjs

import { readFileSync, writeFileSync } from "node:fs";

const REPO_OWNER = "nodes-app";
const REPO_NAME = "swift-markdown-engine";
const REPO = `${REPO_OWNER}/${REPO_NAME}`;
const OUT_DIR = new URL("../profile/assets/", import.meta.url).pathname;
const DATA_FILE = new URL("../profile/data/star-history.json", import.meta.url)
  .pathname;

const FONT = readFileSync(new URL("./plex-mono-subset.woff2", import.meta.url)).toString("base64");
const MONO = "Plex, ui-monospace, Menlo, monospace";

// The Werk 42 colours (werk42-ci, ds/project/tokens.json).
const PAPER = "#efe8d8";
const INK = "#151412";
const STONE = "#5a564c";
const RULE = "#c9c2b0";
const HAIR = "#ddd5c3";
const OCHRE = "#a9773d"; // the fourth cell of line 39

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
const dateOf = (day) => {
  const d = new Date(at(day));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const n = (v) => Number(v.toFixed(2));

const toPath = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${n(x)},${n(y)}`).join(" ");

/** Advance width of a run of Plex Mono: 0.6 em a character. */
const tw = (s, size) => s.length * size * 0.6;

function render(samples) {
  const W = 840;
  const H = 400;
  const m = 40;
  const total = samples[samples.length - 1][1];
  const first = samples[0][0];
  const last = samples[samples.length - 1][0];
  // Leave the top 8% clear so the curve never touches the header rule.
  const yMax = Math.ceil(total / 0.92 / 50) * 50;

  const box = { x: m, y: 96, w: W - 2 * m, h: H - 96 - 64 };
  const t0 = at(first);
  const span = at(last) - t0 || 1;
  const x = (day) => box.x + ((at(day) - t0) / span) * box.w;
  const y = (v) => box.y + box.h - (v / yMax) * box.h;
  const pts = samples.map((s) => [x(s[0]), y(s[1])]);
  const [ex, ey] = pts[pts.length - 1];

  const grid = [];
  for (let v = 250; v < yMax; v += 250) {
    grid.push(
      `<line x1="${box.x}" y1="${n(y(v))}" x2="${box.x + box.w}" y2="${n(y(v))}" stroke="${HAIR}" stroke-width="1"/>`,
      `<text x="${box.x}" y="${n(y(v) - 6)}" fill="${STONE}" font-size="11">${v}</text>`
    );
  }

  // The total sits in the open space under the curve's long taper, knocking
  // the gridlines out behind itself.
  const word = total.toLocaleString("en-US");
  const heroSize = 48;
  const heroX = box.x + 150;
  const heroBase = box.y + box.h - 34;
  const capBase = box.y + box.h - 12;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${REPO}: ${word} stars on GitHub since ${dateOf(first)}">
  <style>@font-face{font-family:Plex;src:url(data:font/woff2;base64,${FONT}) format("woff2")}</style>
  <rect x="0" y="0" width="${W}" height="${H}" fill="${PAPER}"/>
  <g font-family="${MONO}">
    <text x="${m}" y="50" fill="${STONE}" font-size="13">stars on GitHub</text>
    <line x1="${m}" y1="64" x2="${W - m}" y2="64" stroke="${RULE}" stroke-width="1"/>
    ${grid.join("\n    ")}
    <line x1="${box.x}" y1="${box.y + box.h}" x2="${box.x + box.w}" y2="${box.y + box.h}" stroke="${INK}" stroke-width="1"/>
    <rect x="${heroX - 8}" y="${heroBase - heroSize}" width="${n(tw(word, heroSize) + 16)}" height="${capBase - heroBase + heroSize + 6}" fill="${PAPER}"/>
    <text x="${heroX}" y="${heroBase}" fill="${INK}" font-size="${heroSize}">${word}</text>
    <text x="${heroX + 2}" y="${capBase}" fill="${STONE}" font-size="12">stars</text>
    <path d="${toPath(pts)}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${n(ex)}" cy="${n(ey)}" r="6.5" fill="${PAPER}"/>
    <circle cx="${n(ex)}" cy="${n(ey)}" r="4" fill="${OCHRE}"/>
    <text x="${m}" y="${H - 26}" fill="${STONE}" font-size="12">${dateOf(first)}</text>
    <text x="${W - m}" y="${H - 26}" text-anchor="end" fill="${STONE}" font-size="12">${dateOf(last)}</text>
  </g>
</svg>
`;
}

/* --------------------------------------------------------------------- main */

const data = JSON.parse(readFileSync(DATA_FILE, "utf8"));
if (!Array.isArray(data.samples) || data.samples.length === 0) {
  throw new Error("star-history.json has no samples to draw");
}

if (!process.env.STAR_OFFLINE) {
  const count = await fetchStarCount();
  const day = today();
  const last = data.samples[data.samples.length - 1];
  if (last[0] === day) {
    last[1] = count;
  } else {
    data.samples.push([day, count]);
  }
  writeFileSync(DATA_FILE, serialize(data));
}

writeFileSync(`${OUT_DIR}star-history.svg`, render(data.samples));
const end = data.samples[data.samples.length - 1];
console.log(`wrote star-history.svg (${end[1]} stars, ${data.samples.length} samples)`);
