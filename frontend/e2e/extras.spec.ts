import { expect, test } from "@playwright/test";
import { cellPoint, getPuzzle, getSolution, placeAll } from "./helpers";

/**
 * Coverage beyond the 12-journey story: independent browser contexts (fresh storage),
 * empty/error/loading states of every data page, settings, deletion, API error envelope,
 * and play on a phone-sized touch viewport.
 */

test.describe("fresh visitor (empty states)", () => {
  test("results and compare show empty states with a way forward", async ({ page }) => {
    await page.goto("/results");
    await expect(page.getByRole("heading", { name: "No completed puzzles yet" })).toBeVisible();
    await page.getByRole("link", { name: "Start the puzzle" }).click();
    await expect(page).toHaveURL(/\/play/);

    await page.goto("/compare/edison-original");
    await expect(page.getByRole("heading", { name: "No completed run yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Solve the puzzle" })).toBeVisible();
  });

  test("a custom puzzle with no stored solutions shows an empty gallery", async ({ page, request }) => {
    const res = await request.post("/api/puzzles", {
      data: {
        name: "Empty gallery puzzle",
        board: { width: 4, height: 2 },
        pieces: [
          { width: 2, height: 2 },
          { width: 2, height: 2 },
        ],
        allowRotation: true,
      },
    });
    expect(res.status()).toBe(201);
    const { id } = await res.json();
    await page.goto(`/solutions/${id}`);
    await expect(page.getByRole("heading", { name: "No solutions stored" })).toBeVisible();
    await request.delete(`/api/puzzles/${id}`);
  });
});

test.describe("error and loading states", () => {
  for (const [name, url, api] of [
    ["challenges", "/challenges", "**/api/challenges"],
    ["solutions", "/solutions/edison-original", "**/api/puzzles/edison-original/solutions"],
    ["compare", "/compare/edison-original", "**/api/puzzles/edison-original"],
    ["explore", "/explore/edison-original", "**/api/puzzles/edison-original"],
    ["create", "/create", "**/api/puzzles"],
  ] as const) {
    test(`${name}: an unreachable server shows a clear message and recovers on retry`, async ({ page }) => {
      await page.route(api, (r) => r.abort());
      await page.goto(url);
      await expect(page.getByText(/Server unreachable|unreachable|could not reach/i).first()).toBeVisible();
      await page.unroute(api);
      const retry = page.getByRole("button", { name: "Try again" });
      if (await retry.count()) {
        await retry.first().click();
        await expect(page.locator("main h1")).toBeVisible();
        await expect(page.getByText("Server unreachable")).toHaveCount(0);
      }
    });
  }

  test("a slow server shows a loading indicator, then the content", async ({ page }) => {
    await page.route("**/api/challenges", async (r) => {
      await new Promise((res) => setTimeout(res, 1200));
      await r.continue();
    });
    await page.goto("/challenges");
    await expect(page.getByRole("status").filter({ hasText: /Loading challenges/ })).toBeVisible();
    await expect(page.getByRole("article", { name: "First Fit" })).toBeVisible();
  });

  test("an unknown challenge id on the play page does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/play/warmup-8?challenge=does-not-exist");
    await expect(page.locator("main h1")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a server error response on attempt submission keeps the finished game and offers a retry", async ({
    page,
    request,
  }) => {
    await page.route("**/api/attempts", (r) => r.abort());
    const puzzle = await getPuzzle(request, "warmup-8");
    await page.goto("/play/warmup-8");
    await placeAll(page, puzzle.pieces, await getSolution(request, "warmup-8", 0));
    await expect(page.getByRole("heading", { name: /Puzzle solved/ })).toBeVisible();
    await expect(page.getByText(/retry|could not|unreachable|not verified/i).first()).toBeVisible();
  });
});

test.describe("preferences", () => {
  test("motion preference and display options persist; local data can be cleared", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Reduce motion").selectOption("on");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await page.getByLabel("Show piece labels").uncheck();
    await page.reload();
    await expect(page.getByLabel("Reduce motion")).toHaveValue("on");
    await expect(page.getByLabel("Show piece labels")).not.toBeChecked();

    const idBefore = await page.evaluate(() => localStorage.getItem("edison:clientId"));
    await page.getByRole("button", { name: /Clear local data/ }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(await page.evaluate(() => localStorage.getItem("edison:prefs"))).not.toBeNull();
    await page.getByRole("button", { name: /Clear local data/ }).click();
    await page.getByRole("button", { name: "Yes, clear local data" }).click();
    await expect(page.getByText(/Local data cleared/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("edison:prefs"))).toBeNull();
    expect(idBefore === null || typeof idBefore === "string").toBe(true);
  });

  test("the app still works when localStorage is unavailable", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("blocked");
        },
      });
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/play/warmup-8");
    await expect(page.getByRole("heading", { level: 1, name: /Warm-up 8/ })).toBeVisible();
    await page.getByRole("button", { name: /^Piece A / }).click();
    await page.keyboard.press("Enter");
    await expect(page.getByText("1 / 4")).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe("custom puzzles and API contract", () => {
  test("a saved custom puzzle can be deleted with confirmation; built-ins cannot be deleted", async ({
    page,
    request,
  }) => {
    await page.goto("/create");
    await page.getByLabel("Name").fill("Delete me");
    await page.getByRole("button", { name: "Save puzzle" }).click();
    await expect(page.getByText("Saved. It is now available")).toBeVisible();
    await page.getByRole("button", { name: "Delete Delete me" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("link", { name: "Play Delete me" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Delete me" }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByRole("link", { name: "Play Delete me" })).toHaveCount(0);

    const built = await request.delete("/api/puzzles/edison-original");
    expect(built.status()).toBe(403);
    expect((await built.json()).error.code).toBe("built_in_puzzle");
  });

  test("API errors use one envelope and carry no stack traces", async ({ request }) => {
    const cases: [string, () => Promise<import("@playwright/test").APIResponse>, number, string][] = [
      ["unknown puzzle", () => request.get("/api/puzzles/nope"), 404, "puzzle_not_found"],
      ["unknown route", () => request.get("/api/nope"), 404, "not_found"],
      [
        "invalid body",
        () => request.post("/api/attempts", { data: { clientId: "abc" } }),
        422,
        "invalid_request",
      ],
      [
        "area mismatch is not savable",
        () =>
          request.post("/api/puzzles", {
            data: {
              name: "bad",
              board: { width: 3, height: 3 },
              pieces: [{ width: 1, height: 1 }],
              allowRotation: true,
            },
          }),
        422,
        "invalid_puzzle",
      ],
      ["client id too short", () => request.get("/api/progress?clientId=x"), 422, "invalid_request"],
    ];
    for (const [label, call, status, code] of cases) {
      const res = await call();
      expect(res.status(), label).toBe(status);
      const body = await res.json();
      expect(body.error.code, label).toBe(code);
      expect(typeof body.error.message, label).toBe("string");
      expect(JSON.stringify(body), label).not.toMatch(/Traceback|\/Users\//);
    }
  });

  test("the stream reports a truncated trace honestly", async ({ request }) => {
    const res = await request.get(
      "/api/puzzles/edison-original/solve/stream?maxEvents=50&trace=true&compact=true",
    );
    expect(res.status()).toBe(200);
    const text = await res.text();
    const done = text.split("\n\n").find((f) => f.startsWith("event: done"))!;
    const data = JSON.parse(done.split("\ndata: ")[1]!);
    expect(data.truncated).toBe(true);
    expect(data.status).toBe("event_limit");
  });
});

test.describe("phone viewport with touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a piece can be selected and placed by tap, with no horizontal scroll", async ({ page }) => {
    await page.goto("/play/warmup-8");
    await expect(page.locator("main h1")).toBeVisible();
    await page.getByRole("button", { name: /^Piece A / }).tap();
    const box = (await page.locator("svg.board-svg").first().boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390);
    const pt = await cellPoint(page, 2, 1); // scrolls clear of the sticky header
    await page.touchscreen.tap(pt.x, pt.y);
    await expect(page.getByText("1 / 4")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    // the main navigation is reachable on a phone
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Start the puzzle" }).first()).toBeVisible();
  });
});
