import { expect, test } from "@playwright/test";

/** Responsive layout checks + screenshots (written to test-results/screens). */
const VIEWPORTS = [
  { name: "desktop", width: 1360, height: 900 },
  { name: "tablet", width: 820, height: 1100 },
  { name: "mobile", width: 390, height: 844 },
];
const PAGES = [
  ["landing", "/"],
  ["play", "/play/edison-original"],
  ["explore", "/explore/edison-original"],
  ["compare", "/compare/edison-original"],
  ["solutions", "/solutions/edison-original"],
  ["challenges", "/challenges"],
  ["create", "/create"],
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`layout @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    for (const [name, url] of PAGES) {
      test(`${name} has no horizontal overflow and renders content`, async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(url);
        await expect(page.locator("main h1")).toBeVisible();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(1);
        await page.screenshot({ path: `test-results/screens/${vp.name}-${name}.png`, fullPage: true });
        expect(errors).toEqual([]);
      });
    }
  });
}
