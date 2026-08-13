#!/usr/bin/env node
// Rasterises the two hand-made logo SVGs in profile/assets to PNG.
//
// The README is read in three places and only one of them is a browser on
// github.com. The GitHub mobile app renders the raw markdown itself: it has no
// SVG loader, and it ignores <picture>, so it only ever sees the plain <img>.
// Both logos therefore ship as PNG, and the wordmark ships on a paper plate so
// the single image the app falls back to reads on a light and a dark page
// alike - the same trick generate-star-chart.mjs uses for the chart card.
//
// Chrome does the rasterising because it is the one renderer already on every
// machine that builds this repo; rsvg/inkscape/cairosvg are none of them.
//
// Usage: node scripts/rasterize-logos.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ASSETS = new URL("../profile/assets/", import.meta.url).pathname;

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Nodes paper, verbatim from the site palette (--paper in src/style.css) and
// the same value the light star-history card is painted with.
const PAPER = "#edeae1";

// 2x the width the README asks for, doubled again so the mark stays crisp when
// a phone draws it at 3x. Flat two-colour art, so the file stays a few KB.
const SCALE = 2;

const JOBS = [
  {
    // Padding is a share of the mark's own width, so the plate keeps its
    // proportions if the wordmark is ever redrawn at another size.
    src: "nodes-wordmark.svg",
    out: "nodes-wordmark.png",
    plate: PAPER,
    padX: 0.101,
    padY: 0.088,
  },
  {
    // The dots are already three saturated brand colours that hold against
    // paper and near-black alike, so this one only changes format.
    src: "nodes-dots-master.svg",
    out: "nodes-dots-master.png",
    plate: null,
    padX: 0,
    padY: 0,
  },
];

/** Intrinsic size of an SVG, read off its width/height attributes. */
function intrinsicSize(svg) {
  const w = svg.match(/<svg[^>]*\swidth="([\d.]+)"/)?.[1];
  const h = svg.match(/<svg[^>]*\sheight="([\d.]+)"/)?.[1];
  if (!w || !h) throw new Error("svg has no intrinsic width/height");
  return { w: Number(w), h: Number(h) };
}

const work = mkdtempSync(join(tmpdir(), "nodes-logos-"));

for (const job of JOBS) {
  const svg = readFileSync(join(ASSETS, job.src), "utf8");
  const { w, h } = intrinsicSize(svg);
  const padX = Math.round(w * job.padX);
  const padY = Math.round(w * job.padY);
  const page = { w: w + padX * 2, h: h + padY * 2 };

  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${job.plate ?? "transparent"}}
    body{width:${page.w}px;height:${page.h}px;display:flex;
         align-items:center;justify-content:center}
    svg{display:block;width:${w}px;height:${h}px}
  </style>${svg}`;

  const htmlFile = join(work, `${job.out}.html`);
  writeFileSync(htmlFile, html);

  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      // Without this the page is composited onto opaque white and the dots
      // mark loses its transparency.
      "--default-background-color=00000000",
      `--force-device-scale-factor=${SCALE}`,
      `--window-size=${page.w},${page.h}`,
      `--screenshot=${join(work, job.out)}`,
      `file://${htmlFile}`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  renameSync(join(work, job.out), join(ASSETS, job.out));
  console.log(
    `${job.out}  ${page.w * SCALE}x${page.h * SCALE}  ${job.plate ? `plate ${job.plate}` : "transparent"}`,
  );
}
