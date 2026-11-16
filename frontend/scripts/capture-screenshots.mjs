/* global process, console, window */
// Captures the README screenshots (and, optionally, frames for the Explorer GIF)
// from a running instance of the real app.
//
//   make run PORT=8001                         # or any server that serves the built app
//   node scripts/capture-screenshots.mjs http://127.0.0.1:8001 ../docs/screenshots [framesDir]
//   sh scripts/make-explorer-gif.sh framesDir ../docs/screenshots/explorer.gif
//
// It drives the UI like a user (place pieces, run the solver) and writes PNGs.
// Use a throwaway database (EDISON_DB=...): it creates attempts and puzzles.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:8000";
const out = process.argv[3] ?? "../docs/screenshots";
const framesDir = process.argv[4];
const ORIGINAL = "edison-original";
mkdirSync(out, { recursive: true });
if (framesDir) mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const shot = async (name, opts = {}, pg = page) => {
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: `${out}/${name}.png`, ...opts });
  console.log("wrote", name);
};

async function cellPoint(pg, x, y) {
  return pg
    .locator("svg.board-svg")
    .first()
    .evaluate(
      (svg, c) => {
        const p = svg.createSVGPoint();
        p.x = c[0] + 0.5;
        p.y = c[1] + 0.5;
        const q = p.matrixTransform(svg.getScreenCTM());
        return { x: q.x, y: q.y, h: window.innerHeight };
      },
      [x, y],
    );
}

/** Place pieces through the real UI: pick in the tray, rotate with R, click the board. */
async function place(pg, pieces, placements) {
  for (const p of placements) {
    const i = pieces.findIndex((r) => r.id === p.pieceId);
    await pg.getByRole("button", { name: new RegExp(`^Piece ${String.fromCharCode(65 + i)} `) }).click();
    if (p.rotated) await pg.keyboard.press("r");
    const target = { x: p.x + Math.floor(p.width / 2), y: p.y + Math.floor(p.height / 2) };
    let pt = await cellPoint(pg, target.x, target.y);
    if (pt.y < 120 || pt.y > pt.h - 20) {
      await pg.evaluate((dy) => window.scrollBy(0, dy), pt.y - pt.h / 2);
      pt = await cellPoint(pg, target.x, target.y);
    }
    await pg.mouse.click(pt.x, pt.y);
  }
}

const pieces = (await (await ctx.request.get(`${base}/api/puzzles/${ORIGINAL}`)).json()).pieces;
const solution = (await (await ctx.request.get(`${base}/api/puzzles/${ORIGINAL}/solutions`)).json())
  .solutions[0].placements;

// 1 · landing
await page.goto(`${base}/`);
await page.getByRole("heading", { level: 1 }).waitFor();
await shot("landing");

// 2 · playground, part-way through a solution
await page.goto(`${base}/play/${ORIGINAL}`);
await page.locator("svg.board-svg").first().waitFor();
await place(page, pieces, solution.slice(0, 8));
await page.evaluate(() => window.scrollTo(0, 0));
await shot("playground");

// 3 · the finished board with the server-verified result
await place(page, pieces, solution.slice(8));
await page
  .getByText(/verified/i)
  .first()
  .waitFor({ timeout: 15000 });
await page.evaluate(() => window.scrollTo(0, 0));
await shot("playground-complete");

// 4 · algorithm explorer, stopped partway through the search
await page.goto(`${base}/explore/${ORIGINAL}`);
await page.getByRole("button", { name: "Record the solver run" }).click();
await page.getByText(/event 0 of/).waitFor();
await page.getByRole("button", { name: "Next dead end ▶" }).click();
await page.getByRole("button", { name: "Next dead end ▶" }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await shot("explorer");

// 4b · frames for the Explorer GIF: the search placing and taking back pieces, then landing on the solution
if (framesDir) {
  await page.getByRole("button", { name: "Back to start" }).click();
  let n = 0;
  const frame = async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(60);
    await page.screenshot({
      path: `${framesDir}/f${String(n++).padStart(3, "0")}.png`,
      clip: { x: 0, y: 0, width: 1440, height: 1000 },
    });
  };
  await frame();
  for (let i = 0; i < 70; i++) {
    await page.getByRole("button", { name: "Next board change ▶" }).click();
    await frame();
  }
  await page.getByRole("button", { name: "Solution ▶" }).click();
  for (let i = 0; i < 6; i++) await frame();
  console.log("wrote", n, "frames");
}

// 5 · human vs algorithm
await page.goto(`${base}/compare/${ORIGINAL}`);
await page.getByRole("button", { name: "Run the solver" }).click();
await page.getByRole("heading", { name: "Metrics" }).waitFor();
await page.evaluate(() => window.scrollTo(0, 0));
await shot("compare");

// 6 · solutions gallery
await page.goto(`${base}/solutions/${ORIGINAL}`);
await page.getByRole("heading", { level: 1 }).waitFor();
await shot("gallery");

// 7 · challenges
await page.goto(`${base}/challenges`);
await page.getByRole("heading", { level: 1 }).waitFor();
await shot("challenges");

// 8 · puzzle creator
await page.goto(`${base}/create`);
await page.getByRole("heading", { level: 1 }).waitFor();
await shot("creator");

// 9 · phone-sized viewport
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const m = await phone.newPage();
await m.goto(`${base}/`);
await m.getByRole("heading", { level: 1 }).waitFor();
await shot("mobile-landing", {}, m);
await m.goto(`${base}/play/${ORIGINAL}`);
await m.locator("svg.board-svg").first().waitFor();
await place(m, pieces, solution.slice(0, 4));
await m.evaluate(() => window.scrollTo(0, 0));
await shot("mobile-playground", {}, m);

await browser.close();
