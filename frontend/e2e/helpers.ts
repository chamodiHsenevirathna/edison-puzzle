import type { APIRequestContext, Page } from "@playwright/test";

interface Piece {
  id: string;
  width: number;
  height: number;
}
interface Pl {
  pieceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

export const letter = (i: number) => String.fromCharCode(65 + i);

export async function getPuzzle(request: APIRequestContext, id: string): Promise<{ pieces: Piece[] }> {
  return (await request.get(`/api/puzzles/${id}`)).json();
}
export async function getSolution(request: APIRequestContext, id: string, index = 0): Promise<Pl[]> {
  const body = await (await request.get(`/api/puzzles/${id}/solutions`)).json();
  return body.solutions[index].placements;
}

/** Viewport coordinates of the centre of board cell (x, y), scrolling it into view first. */
export async function cellPoint(page: Page, x: number, y: number) {
  const measure = () =>
    page
      .locator("svg.board-svg")
      .first()
      .evaluate(
        (svg, c) => {
          const s = svg as SVGSVGElement;
          const p = s.createSVGPoint();
          p.x = c[0]! + 0.5;
          p.y = c[1]! + 0.5;
          const q = p.matrixTransform(s.getScreenCTM()!);
          return { x: q.x, y: q.y, h: window.innerHeight };
        },
        [x, y],
      );
  let pt = await measure();
  if (pt.y < 150 || pt.y > pt.h - 20) {
    await page.evaluate((dy) => window.scrollBy(0, dy), pt.y - pt.h / 2);
    pt = await measure();
  }
  return { x: pt.x, y: pt.y };
}

/** Place one piece through the real UI: select in tray, rotate if needed, click the board. */
export async function placePiece(page: Page, pieces: Piece[], p: Pl) {
  const i = pieces.findIndex((r) => r.id === p.pieceId);
  await page.getByRole("button", { name: new RegExp(`^Piece ${letter(i)} `) }).click();
  if (p.rotated) await page.keyboard.press("r");
  const target = { x: p.x + Math.floor(p.width / 2), y: p.y + Math.floor(p.height / 2) };
  const pt = await cellPoint(page, target.x, target.y);
  await page.mouse.click(pt.x, pt.y);
}

export async function placeAll(page: Page, pieces: Piece[], placements: Pl[]) {
  for (const p of placements) await placePiece(page, pieces, p);
}
