"""Independent brute-force tiling enumerator used as a test oracle.

Deliberately uses a different search order (column-major anchor cell) and a
plain cell grid, so it shares no logic with the production solver.
Returns each tiling as a frozenset of (x, y, w, h) rectangles.
"""

from collections import Counter


def all_tilings(bw, bh, dims, allow_rotation=True):
    grid = [[False] * bw for _ in range(bh)]
    counts = Counter(tuple(d) for d in dims)
    found = set()
    placed = []

    def first_free():
        for x in range(bw):  # column-major
            for y in range(bh):
                if not grid[y][x]:
                    return x, y
        return None

    def fits(x, y, w, h):
        if x + w > bw or y + h > bh:
            return False
        return all(not grid[yy][xx] for yy in range(y, y + h) for xx in range(x, x + w))

    def paint(x, y, w, h, v):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                grid[yy][xx] = v

    def rec():
        cell = first_free()
        if cell is None:
            if all(c == 0 for c in counts.values()):
                found.add(frozenset(placed))
            return
        x, y = cell
        for dim in list(counts):
            if counts[dim] == 0:
                continue
            w, h = dim
            for pw, ph in {(w, h), (h, w)} if allow_rotation else {(w, h)}:
                if fits(x, y, pw, ph):
                    paint(x, y, pw, ph, True)
                    counts[dim] -= 1
                    placed.append((x, y, pw, ph))
                    rec()
                    placed.pop()
                    counts[dim] += 1
                    paint(x, y, pw, ph, False)

    rec()
    return found


def geometry(solution):
    return frozenset((p.x, p.y, p.width, p.height) for p in solution.placements)
