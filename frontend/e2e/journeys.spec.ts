import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cellPoint, getPuzzle, getSolution, letter, placeAll, placePiece } from "./helpers";

const ORIGINAL = "edison-original";

test.describe.configure({ mode: "serial" });

// One browser session for the whole file: the journeys are a continuous user story
// (a run completed in step 3 is what step 6 compares), so storage must persist between them.
let ctx: BrowserContext;
let page: Page;
const errors: string[] = [];

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
});
test.afterAll(async () => {
  expect(errors, "uncaught page errors during the session").toEqual([]);
  await ctx.close();
});

test("1 · opens the product and starts the original puzzle", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Twelve rectangles");
  await page.getByRole("link", { name: "Start the puzzle" }).first().click();
  await expect(page).toHaveURL(/\/play\/edison-original$/);
  await expect(page.getByRole("heading", { level: 1, name: /Edison Puzzle \(original\)/ })).toBeVisible();
  await expect(page.getByText("0 / 12")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Piece A 28×14/ })).toBeVisible();
});

test("2 · places, rotates, moves, removes, undoes and redoes pieces", async () => {
  await page.goto(`/play/${ORIGINAL}`);
  // place A (28x14) at the top-left by clicking the board
  await page.getByRole("button", { name: /^Piece A / }).click();
  let pt = await cellPoint(page, 14, 7);
  await page.mouse.move(pt.x, pt.y);
  await expect(page.locator(".ghost:not(.invalid)")).toBeVisible(); // valid preview
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByText("1 / 12")).toBeVisible();
  await expect(page.locator('[data-piece="r01"]')).toBeVisible();

  // an overlapping placement is refused with an explanation, and the piece stays in the tray
  await page.getByRole("button", { name: /^Piece B / }).click();
  pt = await cellPoint(page, 10, 5);
  await page.mouse.move(pt.x, pt.y);
  await expect(page.locator(".ghost.invalid")).toBeVisible();
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByRole("alert")).toContainText(/overlaps piece A/);
  await expect(page.getByText("1 / 12")).toBeVisible();
  await page.keyboard.press("Escape");

  // select the placed piece, rotate it (28x14 -> 14x28), then undo
  pt = await cellPoint(page, 5, 5);
  await page.mouse.click(pt.x, pt.y);
  await page.keyboard.press("r");
  const rotated = await page
    .locator('[data-piece="r01"] rect.body')
    .evaluate((r) => [r.getAttribute("width"), r.getAttribute("height")]);
  expect(rotated).toEqual(["14", "28"]);
  await page.getByRole("button", { name: "Undo" }).click();
  const back = await page
    .locator('[data-piece="r01"] rect.body')
    .evaluate((r) => [r.getAttribute("width"), r.getAttribute("height")]);
  expect(back).toEqual(["28", "14"]);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator('[data-piece="r01"] rect.body')).toHaveAttribute("width", "14");

  // move it by clicking an empty destination, then remove it
  pt = await cellPoint(page, 3, 3);
  await page.mouse.click(pt.x, pt.y); // select
  const dest = await cellPoint(page, 40, 40);
  await page.mouse.click(dest.x, dest.y); // move there
  await expect(page.locator('[data-piece="r01"] rect.body')).toHaveAttribute("x", /^(3[0-9]|4[0-9])$/);
  const moved = await cellPoint(page, 40, 40);
  await page.mouse.click(moved.x, moved.y); // select it at its new location
  await page.keyboard.press("Delete");
  await expect(page.getByText("0 / 12")).toBeVisible();
  await expect(page.getByText("Pieces · 12 left")).toBeVisible();
});

test("3 · completes the puzzle, sees a server-verified result, then resets and retries", async ({
  request,
}) => {
  const puzzle = await getPuzzle(request, ORIGINAL);
  const solution = await getSolution(request, ORIGINAL, 0);
  await page.goto(`/play/${ORIGINAL}`);
  await page.getByRole("button", { name: "Reset" }).click(); // start a clean attempt (step 2 left a game in progress)
  await placeAll(page, puzzle.pieces, solution);
  await expect(page.getByRole("heading", { name: /Puzzle solved in/ })).toBeVisible();
  await expect(page.getByText("The server independently checked this arrangement")).toBeVisible();
  await expect(page.getByText("12 / 12")).toBeVisible();
  // the stored attempt is real
  const attempts = await (
    await request.get(
      `/api/attempts?clientId=${await page.evaluate(() => JSON.parse(localStorage.getItem("edison:clientId")!))}`,
    )
  ).json();
  expect(attempts.attempts).toHaveLength(1);
  expect(attempts.attempts[0].actions).toBe(12);

  // frozen: further clicks do nothing
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("0 / 12")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Puzzle solved/ })).toHaveCount(0);
});

test("4 · keyboard-only play: select, move cursor, place, rotate, remove", async () => {
  await page.goto("/play/warmup-8"); // pieces: A 8x3, B 5x5, C 3x2, D 3x3
  await page.getByRole("button", { name: /^Piece A / }).focus();
  await page.keyboard.press("Enter"); // select; focus moves to the board
  await expect(page.getByRole("group", { name: /Puzzle board/ })).toBeFocused();
  await page.keyboard.press("Enter"); // place at cursor (0,0)
  await expect(page.getByText("1 / 4")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown"); // cursor to (0,3)
  await page.keyboard.press("Enter"); // nothing under the cursor -> no piece to pick up
  await page.getByRole("button", { name: /^Piece B / }).click();
  await page.keyboard.press("Enter");
  await expect(page.getByText("2 / 4")).toBeVisible();
  // pick the piece up with Enter on it, nudge it right with an arrow, remove it with Delete
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-piece="r02"] rect.body')).toHaveAttribute("x", "1");
  await page.keyboard.press("Delete");
  await expect(page.getByText("1 / 4")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByText("2 / 4")).toBeVisible();
});

test("5 · explorer streams real solver events and plays them forwards and backwards", async () => {
  await page.goto(`/explore/${ORIGINAL}`);
  await expect(page.getByText("Nothing recorded yet")).toBeVisible();
  await page.getByRole("button", { name: "Record the solver run" }).click();
  await expect(page.getByText("Whole run (from the solver)")).toBeVisible();
  await expect(page.getByText("1,102")).toBeVisible(); // search nodes from the engine
  await expect(page.getByText(/event 0 of 23,291/)).toBeVisible();

  await page.getByRole("button", { name: "Step ▶" }).click();
  await expect(page.getByText(/event 1 of 23,291/)).toBeVisible();
  await expect(page.getByText("solver started").first()).toBeVisible();
  await page.getByRole("button", { name: "Step ▶" }).click();
  await expect(page.getByText(/first free cell is \(0, 0\)/).first()).toBeVisible();
  await page.getByRole("button", { name: "◀ Step" }).click();
  await expect(page.getByText(/event 1 of 23,291/)).toBeVisible();

  // jump to the next dead end: the narration explains backtracking
  await page.getByRole("button", { name: "Next dead end ▶" }).click();
  await expect(page.getByText(/Dead end/).first()).toBeVisible();

  // jump to the solution: 12 pieces, 100% covered, counters match the engine's final metrics
  await page.getByRole("button", { name: "Solution ▶" }).click();
  await expect(page.getByText("Solution found: all 12 pieces").first()).toBeVisible();
  await expect(page.getByText("12 / 12").first()).toBeVisible();
  await expect(page.locator("svg.board-svg g.piece")).toHaveCount(12);
  await expect(page.getByText("8,443").first()).toBeVisible(); // placements tried: the engine's own metric for this run

  // playback runs and the speed can change
  await page.getByLabel("Speed").selectOption("2000");
  await page.getByRole("button", { name: "Back to start" }).click();
  await page.getByRole("button", { name: "▶ Play" }).click();
  await expect(page.getByText(/Solution found: all 12 pieces/).first()).toBeVisible({ timeout: 20_000 }); // auto-pauses on the solution
  await expect(page.getByRole("button", { name: /Play|Replay/ })).toBeVisible();
});

test("6 · compares the human run with the algorithm", async () => {
  await page.goto(`/compare/${ORIGINAL}`);
  await expect(page.getByRole("heading", { name: "You", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run the solver" }).click();
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Board changes/ })).toContainText("12"); // the human's 12 actions
  await expect(page.getByRole("row", { name: /Moves taken back/ })).toBeVisible();
  await expect(page.getByText("Is this comparison fair?")).toBeVisible();
  // the human solved it with the gallery's first arrangement; the solver found a rotation/reflection of the same family
  await expect(page.getByText(/same underlying solution/)).toBeVisible();
});

test("7 · browses the solutions gallery", async () => {
  await page.goto(`/solutions/${ORIGINAL}`);
  await expect(page.getByText(/8\s+arrangements in\s+1\s+solution family/)).toBeVisible();
  await expect(page.getByText("Rotations and reflections are not new solutions.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Arrangement \d/ })).toHaveCount(8);
  await page.getByRole("button", { name: /^Arrangement 3/ }).click();
  await expect(page.getByRole("heading", { name: "Arrangement #3" })).toBeVisible();
  await expect(page.getByRole("table", { name: /Pieces in arrangement 3/ })).toBeVisible();
  await expect(page.getByText(/arrangement #1/i)).toBeVisible();
});

test("8 · attempts a challenge to completion and sees progress", async ({ request }) => {
  await page.goto("/challenges");
  await expect(page.getByText("0 of 7 complete")).toBeVisible();
  await page.getByRole("article", { name: "First Fit" }).getByRole("link", { name: "Start" }).click();
  await expect(page).toHaveURL(/play\/warmup-8\?challenge=first-fit/);
  const puzzle = await getPuzzle(request, "warmup-8");
  await placeAll(page, puzzle.pieces, await getSolution(request, "warmup-8", 0));
  await expect(page.getByRole("heading", { name: /Puzzle solved/ })).toBeVisible();
  await expect(page.locator(".badge.ok", { hasText: "Passed" })).toBeVisible();
  await page.goto("/challenges");
  await expect(page.getByText("1 of 7 complete")).toBeVisible();
  await expect(page.getByRole("article", { name: "First Fit" }).getByText("Completed")).toBeVisible();
});

test("8b · a challenge limit that is broken is reported honestly", async ({ request }) => {
  // "Steady Hands": no undo. Use undo once, then finish.
  await page.goto("/play/warmup-16?challenge=steady-hands");
  const puzzle = await getPuzzle(request, "warmup-16");
  const sol = await getSolution(request, "warmup-16", 0);
  await placePiece(page, puzzle.pieces, sol[0]!);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/A limit has been passed/)).toBeVisible();
  await placeAll(page, puzzle.pieces, sol);
  await expect(page.getByRole("heading", { name: /Puzzle solved/ })).toBeVisible();
  await expect(page.locator(".badge.danger", { hasText: "Not met" })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Challenge result" })
      .getByText(/No undo used/)
      .first(),
  ).toBeVisible();
});

const piece = (l: string) => page.getByRole("group", { name: `Piece ${l}` });

test("9 · creates, validates, saves, solves and plays a custom puzzle", async () => {
  await page.goto("/create");
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
  // default: 12x8 board (96) with 6x8 + 6x4 + 6x4 = 96 -> valid
  await expect(page.getByText("The checks pass.")).toBeVisible();

  // break it: remove a piece -> area explanation, save disabled
  await page.getByRole("button", { name: "Remove piece C" }).click();
  await expect(page.getByText(/24 cells short/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save puzzle" })).toBeDisabled();
  // invalid dimension
  await page.getByLabel("Width (cells)").fill("0");
  await expect(page.getByText(/whole numbers greater than zero/)).toBeVisible();
  await page.getByLabel("Width (cells)").fill("12");
  // an oversized piece is explained
  await page.getByRole("button", { name: "+ Add piece" }).click();
  await piece("C").getByLabel("Width").fill("20");
  await expect(page.getByText(/does not fit on a 12 × 8 board/)).toBeVisible();
  await piece("C").getByLabel("Width").fill("6");
  await piece("C").getByLabel("Height").fill("4");
  await expect(page.getByText("The checks pass.")).toBeVisible();

  await page.getByLabel("Name").fill("E2E puzzle");
  await page.getByRole("button", { name: "Save puzzle" }).click();
  await expect(page.getByText("Saved. It is now available")).toBeVisible();
  await expect(page.getByText("My puzzles · 1")).toBeVisible();

  await page.getByRole("button", { name: "Ask the solver" }).click();
  await expect(page.getByText("Solved: the solver found a way to tile the board.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Solver solution" })).toBeVisible();

  // persisted server-side: survives a reload, shows in pickers, is playable
  await page.reload();
  await expect(page.getByText("My puzzles · 1")).toBeVisible();
  await page.getByRole("link", { name: "Play E2E puzzle" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E puzzle" })).toBeVisible();
  await expect(page.getByText("0 / 3")).toBeVisible();
});

test("9b · an unsolvable-but-balanced custom puzzle is reported as such by the solver", async () => {
  await page.goto("/create");
  await page.getByLabel("Width (cells)").fill("3");
  await page.getByLabel("Height (cells)").fill("3");
  // pieces: 2x2, 2x2, 1x1  (area 9, but two 2x2 squares cannot fit on 3x3)
  for (const [l, w, h] of [
    ["A", "2", "2"],
    ["B", "2", "2"],
    ["C", "1", "1"],
  ] as const) {
    await piece(l).getByLabel("Width").fill(w);
    await piece(l).getByLabel("Height").fill(h);
  }
  await expect(page.getByText("The checks pass.")).toBeVisible();
  await page.getByLabel("Name").fill("Impossible squares");
  await page.getByRole("button", { name: "Save puzzle" }).click();
  await page.getByRole("button", { name: "Ask the solver" }).click();
  await expect(page.getByText(/No solution exists/)).toBeVisible();
});

test("10 · results page shows saved runs and re-verifies with the server", async () => {
  await page.goto("/results");
  await expect(page.getByRole("heading", { name: /Edison Puzzle|warm|Warm/i }).first()).toBeVisible();
  await expect(page.getByText(/completed run/)).toBeVisible();
  await expect(page.getByText("The server independently checked")).toBeVisible();
});

test("11 · progress in a game survives a reload", async ({ request }) => {
  const puzzle = await getPuzzle(request, ORIGINAL);
  const sol = await getSolution(request, ORIGINAL, 0);
  await page.goto(`/play/${ORIGINAL}`);
  await page.evaluate(() => localStorage.removeItem("edison:game:edison-original"));
  await page.reload();
  await placePiece(page, puzzle.pieces, sol[0]!);
  await placePiece(page, puzzle.pieces, sol[1]!);
  await expect(page.getByText("2 / 12")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 / 12")).toBeVisible();
  await expect(page.getByText(`Pieces · 10 left`)).toBeVisible();
  const label = letter(puzzle.pieces.findIndex((p) => p.id === sol[0]!.pieceId));
  await expect(page.getByRole("button", { name: new RegExp(`^Piece ${label} .*placed`) })).toHaveCount(0); // placed pieces leave the tray
});

test("12 · empty, error and loading states", async () => {
  await page.goto("/play/does-not-exist");
  await expect(page.getByRole("heading", { name: "Puzzle not found" })).toBeVisible();
  await page.goto("/nope");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  // server down: every data page degrades to a clear message with a retry
  await page.route("**/api/puzzles/edison-original", (r) => r.abort());
  await page.goto("/play/edison-original");
  await expect(page.getByRole("heading", { name: "Server unreachable" })).toBeVisible();
  await page.unroute("**/api/puzzles/edison-original");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Edison Puzzle/ })).toBeVisible();

  // solver busy surfaces as a message in the explorer
  await page.route("**/solve/stream**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'event: error\ndata: {"code":"solver_busy","message":"The solver is busy. Try again in a moment."}\n\n',
    }),
  );
  await page.goto("/explore/edison-original");
  await page.getByRole("button", { name: "Record the solver run" }).click();
  await expect(page.getByText("The solver is busy. Try again in a moment.")).toBeVisible();
});
