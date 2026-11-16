import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/play/edison-original",
  "/explore/edison-original",
  "/compare/edison-original",
  "/solutions/edison-original",
  "/challenges",
  "/create",
  "/settings",
];

for (const url of PAGES) {
  test(`axe: no WCAG A/AA violations on ${url}`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator("main h1")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual(
      [],
    );
  });
}

test("axe: board with pieces placed and an error shown", async ({ page, request }) => {
  await page.goto("/play/warmup-8");
  await page.getByRole("button", { name: /^Piece A / }).click();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^Piece B / }).click();
  await page.keyboard.press("Enter"); // overlaps -> error notice
  await expect(page.getByRole("alert")).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  void request;
});

test("reduced motion preference is honoured", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await ctx.close();
});

test("skip link and focus order reach the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
