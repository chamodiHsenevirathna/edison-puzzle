/** The original puzzle's pieces, as specified. The server is the source of truth; this copy lets
 *  the landing page render without a request, and is checked against the spec in tests. */
export const ORIGINAL_PIECES: ReadonlyArray<readonly [number, number]> = [
  [28, 14],
  [21, 18],
  [21, 18],
  [21, 14],
  [21, 14],
  [32, 11],
  [32, 10],
  [28, 7],
  [28, 6],
  [17, 14],
  [14, 4],
  [10, 7],
];
export const ORIGINAL_BOARD = 56;
