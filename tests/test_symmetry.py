import pytest

from conftest import make_puzzle
from edison_puzzle import Placement, Solution, original_puzzle, validate_solution
from edison_puzzle.data import load_original_solutions
from edison_puzzle.symmetry import (
    IDENTITY,
    LABELS,
    classify,
    geometry,
    transform_geometry,
    transform_rect,
    transform_solution,
    transforms_for,
)
from oracle import all_tilings

ALL = [
    "identity",
    "flip_horizontal",
    "flip_vertical",
    "rotate_180",
    "transpose",
    "rotate_90_cw",
    "rotate_90_ccw",
    "anti_transpose",
]


def test_square_boards_have_eight_symmetries_rectangles_four():
    assert set(transforms_for(5, 5)) == set(ALL)
    assert set(transforms_for(6, 4)) == {"identity", "flip_horizontal", "flip_vertical", "rotate_180"}


def test_known_rect_images_on_a_6x4_board():
    # a 2-wide, 1-tall piece at the top-left corner
    r = (0, 0, 2, 1)
    assert transform_rect("flip_horizontal", r, 6, 4) == (4, 0, 2, 1)
    assert transform_rect("flip_vertical", r, 6, 4) == (0, 3, 2, 1)
    assert transform_rect("rotate_180", r, 6, 4) == (4, 3, 2, 1)


def test_known_rect_images_on_a_square_board():
    r = (0, 0, 3, 1)  # 3 wide, 1 tall in the top-left corner of a 5x5
    assert transform_rect("transpose", r, 5, 5) == (0, 0, 1, 3)
    assert transform_rect("rotate_90_cw", r, 5, 5) == (4, 0, 1, 3)  # top-left strip -> right column
    assert transform_rect("rotate_90_ccw", r, 5, 5) == (0, 2, 1, 3)  # -> left column, bottom
    assert transform_rect("anti_transpose", r, 5, 5) == (4, 2, 1, 3)


def test_square_only_transform_rejected_on_rectangular_board():
    with pytest.raises(ValueError):
        transform_rect("transpose", (0, 0, 1, 1), 6, 4)
    with pytest.raises(ValueError):
        transform_rect("bogus", (0, 0, 1, 1), 4, 4)


@pytest.mark.parametrize("name", ALL)
def test_every_transform_is_an_involution_or_has_its_inverse_in_the_group(name):
    # applying the transform 4 times returns to the start (orders divide 4)
    g = frozenset({(0, 0, 3, 2), (3, 0, 1, 4), (0, 2, 3, 2)})
    cur = g
    for _ in range(4):
        cur = transform_geometry(name, cur, 4, 4)
    assert cur == g


@pytest.mark.parametrize("name", ALL)
def test_transforms_preserve_tiling_validity_on_the_original(name):
    puz = original_puzzle()
    sols, _ = load_original_solutions()
    t = transform_solution(puz, sols[0], name)
    assert validate_solution(puz, t.placements).valid


def test_transform_keeps_rotated_flags_consistent():
    puz = make_puzzle(2, 3, [(3, 2)])
    sol = Solution("t", (Placement("p1", 0, 0, 2, 3, True),))
    out = transform_solution(puz, sol, "flip_horizontal")
    assert out.placements[0].rotated is True and (out.placements[0].width, out.placements[0].height) == (2, 3)


def test_two_dominoes_one_family_with_two_distinct_images():
    puz = make_puzzle(2, 2, [(1, 2), (1, 2)])
    from edison_puzzle import SolverOptions, solve

    sols = solve(puz, SolverOptions(max_solutions=None)).solutions
    assert len(sols) == 2
    fams = classify(puz, sols)
    assert len(fams) == 1
    assert fams[0].distinct_images == 2  # vertical pair and horizontal pair
    assert {m.transform for m in fams[0].members} <= set(ALL)
    # the recorded transform really maps the canonical onto the member
    base = geometry(sols[fams[0].canonical_index].placements)
    for m in fams[0].members:
        assert transform_geometry(m.transform, base, 2, 2) == geometry(sols[m.solution_index].placements)


def test_classification_matches_independent_oracle_on_a_square_board():
    puz = make_puzzle(4, 4, [(2, 2), (2, 2), (4, 1), (4, 1)])
    tilings = all_tilings(4, 4, [(2, 2), (2, 2), (4, 1), (4, 1)])
    from edison_puzzle import SolverOptions, solve

    sols = solve(puz, SolverOptions(max_solutions=None)).solutions
    fams = classify(puz, sols)
    # every tiling is in exactly one family; family members are exactly the symmetry images
    assert sum(len(f.members) for f in fams) == len(sols) == len(tilings)
    for f in fams:
        base = geometry(sols[f.canonical_index].placements)
        images = {transform_geometry(n, base, 4, 4) for n in transforms_for(4, 4)}
        assert {geometry(sols[m.solution_index].placements) for m in f.members} == images & tilings
        assert f.distinct_images == len(images)


def test_original_eight_solutions_are_one_family_using_all_eight_symmetries():
    puz = original_puzzle()
    sols, nodes = load_original_solutions()
    assert len(sols) == 8 and nodes > 1_000_000
    for s in sols:
        assert validate_solution(puz, s.placements).valid
    fams = classify(puz, sols)
    assert len(fams) == 1
    assert fams[0].distinct_images == 8  # the arrangement has no symmetry of its own
    assert {m.transform for m in fams[0].members} == set(ALL)
    assert fams[0].members[0].transform == IDENTITY
    assert all(t in LABELS for t in ALL)


def test_distinct_geometry_for_all_eight_original_solutions():
    sols, _ = load_original_solutions()
    assert len({geometry(s.placements) for s in sols}) == 8
