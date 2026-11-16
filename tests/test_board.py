import pytest

from edison_puzzle import Board, Placement, PlacementError


def P(pid, x, y, w, h, rotated=False):
    return Placement(pid, x, y, w, h, rotated)


# ------------------------------------------------------------ initialisation
def test_new_board_is_empty():
    b = Board(5, 3)
    assert (b.width, b.height, b.area) == (5, 3, 15)
    assert b.free_area == 15 and not b.is_full
    assert b.placements == ()
    assert b.first_free() == (0, 0)
    assert b.to_grid() == [[None] * 5 for _ in range(3)]


@pytest.mark.parametrize("w,h", [(0, 3), (3, 0), (-1, -1)])
def test_board_rejects_non_positive_size(w, h):
    with pytest.raises(ValueError):
        Board(w, h)


# ---------------------------------------------------------------- validity
def test_valid_placement_occupies_exactly_its_cells():
    b = Board(5, 4)
    b.place(P("a", 1, 1, 3, 2))
    occupied = {(x, y) for y in range(4) for x in range(5) if b.is_occupied(x, y)}
    assert occupied == {(x, y) for x in range(1, 4) for y in range(1, 3)}
    assert b.free_area == 20 - 6


def test_piece_exactly_filling_board_edge_is_in_bounds():
    b = Board(5, 4)
    assert b.check(2, 2, 3, 2) is None  # touches right and bottom edges


@pytest.mark.parametrize(
    "x,y,w,h",
    [
        (3, 0, 3, 1),  # sticks out right by 1
        (0, 3, 1, 2),  # sticks out bottom by 1
        (-1, 0, 2, 2),  # negative x
        (0, -1, 2, 2),  # negative y
        (0, 0, 6, 1),  # wider than board
        (0, 0, 1, 5),  # taller than board
    ],
)
def test_out_of_bounds_is_rejected(x, y, w, h):
    b = Board(5, 4)
    assert b.check(x, y, w, h) == "out_of_bounds"
    with pytest.raises(PlacementError) as e:
        b.place(P("a", x, y, w, h))
    assert e.value.reason == "out_of_bounds"
    assert b.placements == () and b.free_area == 20  # unchanged


@pytest.mark.parametrize(
    "x,y,w,h",
    [
        (0, 0, 3, 2),  # identical footprint
        (1, 1, 2, 2),  # partial overlap (and sticks out nowhere)
        (2, 0, 1, 4),  # crosses through the right column
        (0, 0, 1, 1),  # contained inside
        (2, 1, 1, 1),  # single shared cell (bottom-right corner)
    ],
)
def test_overlap_is_rejected(x, y, w, h):
    b = Board(5, 4)
    b.place(P("a", 0, 0, 3, 2))
    assert b.check(x, y, w, h) == "overlap"
    with pytest.raises(PlacementError) as e:
        b.place(P("b", x, y, w, h))
    assert e.value.reason == "overlap"
    assert b.placements == (P("a", 0, 0, 3, 2),)


def test_touching_edges_do_not_overlap():
    b = Board(5, 4)
    b.place(P("a", 0, 0, 2, 2))
    assert b.check(2, 0, 3, 2) is None  # right neighbour
    assert b.check(0, 2, 2, 2) is None  # bottom neighbour


def test_duplicate_piece_id_is_rejected_even_at_free_location():
    b = Board(5, 4)
    b.place(P("a", 0, 0, 1, 1))
    with pytest.raises(PlacementError) as e:
        b.place(P("a", 3, 3, 1, 1))
    assert e.value.reason == "already_placed"


def test_zero_or_negative_size_is_invalid():
    b = Board(5, 4)
    assert b.check(0, 0, 0, 2) == "invalid_size"
    assert b.check(0, 0, 2, -1) == "invalid_size"


# ----------------------------------------------------------------- rotation
def test_rotation_changes_which_orientation_fits():
    b = Board(4, 2)
    assert b.check(0, 0, 3, 2) is None  # 3 wide x 2 tall fits
    assert b.check(0, 0, 2, 3) == "out_of_bounds"  # rotated: 2 wide x 3 tall does not


# ---------------------------------------------------------------- first_free
def test_first_free_is_row_major():
    b = Board(4, 3)
    b.place(P("a", 0, 0, 2, 2))
    assert b.first_free() == (2, 0)
    b.place(P("b", 2, 0, 2, 1))
    assert b.first_free() == (2, 1)
    b.place(P("c", 2, 1, 2, 1))
    assert b.first_free() == (0, 2)


def test_first_free_prefers_earlier_row_over_earlier_column():
    b = Board(3, 3)
    b.place(P("a", 0, 0, 1, 3))  # fill column 0
    b.place(P("b", 1, 1, 2, 1))  # leave (1,0),(2,0) free in the top row
    assert b.first_free() == (1, 0)


def test_full_board_has_no_free_cell():
    b = Board(2, 2)
    b.place(P("a", 0, 0, 2, 2))
    assert b.is_full and b.free_area == 0 and b.first_free() is None


def test_free_run_width():
    b = Board(6, 2)
    b.place(P("a", 2, 0, 1, 1))
    assert b.free_run_width(0, 0) == 2
    assert b.free_run_width(3, 0) == 3
    assert b.free_run_width(0, 1) == 6


# -------------------------------------------------------- remove / copy / restore
def test_remove_frees_cells_and_allows_replacement():
    b = Board(4, 4)
    b.place(P("a", 0, 0, 2, 2))
    removed = b.remove("a")
    assert removed == P("a", 0, 0, 2, 2)
    assert b.free_area == 16 and b.first_free() == (0, 0)
    b.place(P("b", 0, 0, 4, 4))
    assert b.is_full


def test_remove_unknown_piece_raises_and_changes_nothing():
    b = Board(4, 4)
    b.place(P("a", 0, 0, 2, 2))
    with pytest.raises(KeyError):
        b.remove("zzz")
    assert b.free_area == 12


def test_removing_a_piece_does_not_free_a_neighbours_cells():
    b = Board(4, 2)
    b.place(P("a", 0, 0, 2, 2))
    b.place(P("b", 2, 0, 2, 2))
    b.remove("a")
    assert all(b.is_occupied(x, y) for x in (2, 3) for y in (0, 1))
    assert not any(b.is_occupied(x, y) for x in (0, 1) for y in (0, 1))


def test_copy_is_independent_in_both_directions():
    a = Board(4, 4)
    a.place(P("x", 0, 0, 2, 2))
    c = a.copy()
    assert c.placements == a.placements and c.free_area == a.free_area

    c.place(P("y", 2, 0, 2, 2))
    assert a.free_area == 12 and not a.has_piece("y")

    a.remove("x")
    assert c.has_piece("x") and c.is_occupied(0, 0)


def test_snapshot_restore_returns_to_earlier_state():
    b = Board(4, 4)
    b.place(P("a", 0, 0, 2, 2))
    snap = b.snapshot()
    b.place(P("b", 2, 0, 2, 2))
    b.remove("a")
    b.restore(snap)
    assert b.placements == snap == (P("a", 0, 0, 2, 2),)
    assert b.free_area == 12 and b.first_free() == (2, 0)
    assert not b.has_piece("b")


def test_snapshot_is_immutable_view_unaffected_by_later_changes():
    b = Board(4, 4)
    b.place(P("a", 0, 0, 2, 2))
    snap = b.snapshot()
    b.remove("a")
    assert snap == (P("a", 0, 0, 2, 2),)


def test_restore_empty_clears_board():
    b = Board(3, 3)
    b.place(P("a", 0, 0, 3, 3))
    b.restore(())
    assert b.free_area == 9 and b.placements == () and b.first_free() == (0, 0)


def test_restore_invalid_snapshot_leaves_board_unchanged():
    b = Board(4, 4)
    b.place(P("keep", 0, 0, 1, 1))
    with pytest.raises(PlacementError):
        b.restore([P("a", 0, 0, 2, 2), P("b", 1, 1, 2, 2)])  # overlapping
    assert b.placements == (P("keep", 0, 0, 1, 1),)
    assert b.free_area == 15


def test_to_grid_labels_cells_by_piece():
    b = Board(3, 2)
    b.place(P("a", 0, 0, 2, 1))
    b.place(P("b", 2, 0, 1, 2))
    assert b.to_grid() == [["a", "a", "b"], [None, None, "b"]]
