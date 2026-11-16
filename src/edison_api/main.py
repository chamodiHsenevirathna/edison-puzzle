"""FastAPI application factory and routes."""

from __future__ import annotations

import logging
import re
from typing import Any, Literal

from fastapi import FastAPI, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from edison_puzzle import Placement, PuzzleConfig, validate_solution
from edison_puzzle.analysis import ERROR, MAX_BOARD_SIDE, MAX_PIECES, analyze_puzzle_input
from edison_puzzle.catalog import ORIGINAL_PUZZLE_ID, builtin_puzzles
from edison_puzzle.challenges import CHALLENGES, evaluate, get_challenge
from edison_puzzle.data import load_original_solutions
from edison_puzzle.symmetry import LABELS, classify, transforms_for

from .config import Settings
from .db import Store
from .errors import ApiError, install_error_handlers
from .solving import Slots, clamp, run_sync, stream

log = logging.getLogger("edison_api")

CLIENT_ID_PATTERN = r"^[A-Za-z0-9_-]{8,64}$"


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class PlacementIn(CamelModel):
    piece_id: str = Field(min_length=1, max_length=64)
    x: int = Field(ge=-1000, le=1000)
    y: int = Field(ge=-1000, le=1000)
    width: int = Field(ge=1, le=1000)
    height: int = Field(ge=1, le=1000)
    rotated: bool = False

    def to_placement(self) -> Placement:
        return Placement(self.piece_id, self.x, self.y, self.width, self.height, self.rotated)


class SolveRequest(CamelModel):
    max_solutions: int | None = Field(1, ge=1, le=100_000)
    events: Literal["none", "milestones", "full"] = "none"
    max_nodes: int | None = Field(None, ge=1)
    time_limit_seconds: float | None = Field(None, gt=0)
    max_events: int | None = Field(None, ge=1)
    save: bool = False


class ValidateRequest(CamelModel):
    placements: list[PlacementIn] = Field(max_length=64)


class AttemptRequest(CamelModel):
    client_id: str = Field(pattern=CLIENT_ID_PATTERN)
    puzzle_id: str
    challenge_id: str | None = None
    placements: list[PlacementIn] = Field(max_length=64)
    time_ms: int = Field(ge=0, le=7 * 24 * 3600 * 1000)
    actions: int = Field(ge=0, le=100_000)
    undos: int = Field(ge=0, le=100_000)


def puzzle_detail(puzzle: PuzzleConfig, built_in: bool) -> dict[str, Any]:
    return {
        **puzzle.to_dict(),
        "builtIn": built_in,
        "piecesArea": puzzle.pieces_area,
        "boardArea": puzzle.board_area,
        "areaBalanced": puzzle.is_area_balanced,
    }


def puzzle_summary(puzzle: PuzzleConfig, built_in: bool) -> dict[str, Any]:
    return {
        "id": puzzle.id,
        "name": puzzle.name,
        "board": {"width": puzzle.board_width, "height": puzzle.board_height},
        "pieceCount": len(puzzle.pieces),
        "allowRotation": puzzle.allow_rotation,
        "builtIn": built_in,
    }


def seed_builtins(store: Store) -> None:
    """Make the built-in puzzles and their exhaustive solutions available."""
    from edison_puzzle import SolverOptions, solve

    for order, p in enumerate(builtin_puzzles()):
        store.upsert_builtin(p, order)
        existing, exhaustive = store.list_solutions(p.id)
        if exhaustive:
            continue
        if p.id == ORIGINAL_PUZZLE_ID:
            sols, _ = load_original_solutions()  # exhaustive search, precomputed (see scripts/)
            store.save_solutions(p.id, sols, exhaustive=True)
        else:
            r = solve(p, SolverOptions(max_solutions=None, time_limit_s=20))
            store.save_solutions(p.id, r.solutions, exhaustive=r.status == "exhausted")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = Store(settings.db_path)
    seed_builtins(store)
    slots = Slots(settings.max_concurrent_solves)

    app = FastAPI(title="Edison Puzzle API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
    install_error_handlers(app)
    app.state.store = store
    app.state.slots = slots

    def need_puzzle(puzzle_id: str) -> tuple[PuzzleConfig, bool]:
        found = store.get_puzzle(puzzle_id)
        if found is None:
            raise ApiError(404, "puzzle_not_found", f"No puzzle with id {puzzle_id!r}.")
        return found

    # ------------------------------------------------------------------ meta
    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "version": "1.0.0"}

    @app.get("/api/limits")
    def limits() -> dict[str, Any]:
        return {
            "maxBoardSide": MAX_BOARD_SIDE,
            "maxPieces": MAX_PIECES,
            "maxCustomPuzzles": settings.max_custom_puzzles,
            "solver": {
                "defaultMaxNodes": settings.default_max_nodes,
                "hardMaxNodes": settings.hard_max_nodes,
                "defaultTimeLimitSeconds": settings.default_time_limit_s,
                "hardTimeLimitSeconds": settings.hard_time_limit_s,
                "defaultMaxEvents": settings.default_max_events,
                "hardMaxEvents": settings.hard_max_events,
                "maxConcurrentSolves": settings.max_concurrent_solves,
            },
        }

    # --------------------------------------------------------------- puzzles
    @app.get("/api/puzzles")
    def list_puzzles() -> dict[str, Any]:
        return {"puzzles": [puzzle_summary(p, b) for p, b in store.list_puzzles()]}

    @app.post("/api/puzzles/analyze")
    def analyze(body: dict[str, Any]) -> dict[str, Any]:
        return analyze_puzzle_input(body).to_dict()

    @app.post("/api/puzzles", status_code=201)
    def create_puzzle(body: dict[str, Any]) -> dict[str, Any]:
        analysis = analyze_puzzle_input(body)
        if not analysis.can_save or analysis.config is None:
            errors = [i.to_dict() for i in analysis.issues if i.severity == ERROR]
            raise ApiError(422, "invalid_puzzle", errors[0]["message"] if errors else "Invalid puzzle.", errors)
        if store.count_custom() >= settings.max_custom_puzzles:
            raise ApiError(
                409,
                "limit_exceeded",
                f"At most {settings.max_custom_puzzles} custom puzzles can be stored. Delete one first.",
            )
        cfg = analysis.config
        puzzle = PuzzleConfig(
            store.new_puzzle_id(), cfg.name, cfg.board_width, cfg.board_height, cfg.pieces, cfg.allow_rotation
        )
        store.add_custom_puzzle(puzzle)
        return puzzle_detail(puzzle, False)

    @app.get("/api/puzzles/{puzzle_id}")
    def get_puzzle(puzzle_id: str) -> dict[str, Any]:
        p, b = need_puzzle(puzzle_id)
        return puzzle_detail(p, b)

    @app.delete("/api/puzzles/{puzzle_id}", status_code=204)
    def delete_puzzle(puzzle_id: str) -> None:
        _, built_in = need_puzzle(puzzle_id)
        if built_in:
            raise ApiError(403, "built_in_puzzle", "Built-in puzzles cannot be deleted.")
        store.delete_custom_puzzle(puzzle_id)

    # ---------------------------------------------------------------- solving
    @app.post("/api/puzzles/{puzzle_id}/solve")
    def solve_puzzle(puzzle_id: str, req: SolveRequest) -> dict[str, Any]:
        puzzle, _ = need_puzzle(puzzle_id)
        max_solutions = req.max_solutions if "max_solutions" in req.model_fields_set else 1
        lim = clamp(
            settings,
            max_solutions=max_solutions,
            max_nodes=req.max_nodes,
            time_limit_s=req.time_limit_seconds,
            max_events=req.max_events,
        )
        if not slots.try_acquire():
            raise ApiError(429, "solver_busy", "The solver is busy. Try again in a moment.")
        try:
            body, solutions, exhausted = run_sync(puzzle, lim, req.events)
        finally:
            slots.release()
        if req.save and solutions:
            store.save_solutions(puzzle.id, solutions, exhaustive=exhausted and max_solutions is None)
        return body

    @app.get("/api/puzzles/{puzzle_id}/solve/stream")
    async def solve_stream(
        puzzle_id: str,
        request: Request,
        max_solutions: str = Query("1", alias="maxSolutions", pattern=r"^(all|[1-9][0-9]{0,4})$"),
        max_nodes: int | None = Query(None, alias="maxNodes", ge=1),
        time_limit_seconds: float | None = Query(None, alias="timeLimitSeconds", gt=0),
        max_events: int | None = Query(None, alias="maxEvents", ge=1),
        trace: bool = True,
        compact: bool = True,
    ) -> StreamingResponse:
        puzzle, _ = need_puzzle(puzzle_id)
        if not slots.available():
            raise ApiError(429, "solver_busy", "The solver is busy. Try again in a moment.")
        lim = clamp(
            settings,
            max_solutions=None if max_solutions == "all" else int(max_solutions),
            max_nodes=max_nodes,
            time_limit_s=time_limit_seconds,
            max_events=max_events,
        )
        gen = stream(request, puzzle, lim, slots, trace=trace, compact=compact, batch_size=settings.stream_batch_size)
        return StreamingResponse(
            gen, media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        )

    @app.post("/api/puzzles/{puzzle_id}/validate")
    def validate(puzzle_id: str, req: ValidateRequest) -> dict[str, Any]:
        puzzle, _ = need_puzzle(puzzle_id)
        return validate_solution(puzzle, [p.to_placement() for p in req.placements]).to_dict()

    # -------------------------------------------------------------- solutions
    @app.get("/api/puzzles/{puzzle_id}/solutions")
    def solutions(puzzle_id: str) -> dict[str, Any]:
        puzzle, _ = need_puzzle(puzzle_id)
        sols, exhaustive = store.list_solutions(puzzle_id)
        families = classify(puzzle, sols)
        fam_of = {m.solution_index: (f, m) for f in families for m in f.members}
        items = []
        for i, s in enumerate(sols):
            f, m = fam_of[i]
            items.append(
                {
                    "index": i,
                    "familyId": f.family_id,
                    "canonical": i == f.canonical_index,
                    "transform": m.transform,
                    "transformLabel": LABELS[m.transform],
                    "placements": [p.to_dict() for p in s.placements],
                }
            )
        return {
            "puzzleId": puzzle_id,
            "exhaustive": exhaustive,
            "count": len(sols),
            "familyCount": len(families),
            "boardSymmetries": len(transforms_for(puzzle.board_width, puzzle.board_height)),
            "solutions": items,
            "families": [f.to_dict() for f in families],
        }

    # ------------------------------------------------------------- challenges
    @app.get("/api/challenges")
    def challenges() -> dict[str, Any]:
        return {"challenges": [c.to_dict() for c in CHALLENGES]}

    # --------------------------------------------------------------- attempts
    @app.post("/api/attempts")
    def submit_attempt(req: AttemptRequest) -> dict[str, Any]:
        puzzle, _ = need_puzzle(req.puzzle_id)
        challenge = None
        if req.challenge_id is not None:
            try:
                challenge = get_challenge(req.challenge_id)
            except KeyError as e:
                raise ApiError(404, "challenge_not_found", f"No challenge {req.challenge_id!r}.") from e
            if challenge.puzzle_id != puzzle.id:
                raise ApiError(422, "challenge_mismatch", "That challenge is for a different puzzle.")
        placements = [p.to_placement() for p in req.placements]
        validation = validate_solution(puzzle, placements)
        minimum = len(puzzle.pieces)
        body: dict[str, Any] = {
            "valid": validation.valid,
            "validation": validation.to_dict(),
            "minimumActions": minimum,
            "attemptId": None,
            "challenge": None,
        }
        if not validation.valid:
            return body
        if req.actions < minimum:
            raise ApiError(
                422, "implausible_stats", f"A complete tiling needs at least {minimum} actions; got {req.actions}."
            )
        result = (
            evaluate(challenge, solved=True, time_ms=req.time_ms, actions=req.actions, undos=req.undos)
            if challenge
            else None
        )
        body["challenge"] = result.to_dict() if result else None
        body["attemptId"] = store.add_attempt(
            client_id=req.client_id,
            puzzle_id=puzzle.id,
            challenge_id=req.challenge_id,
            passed=result.passed if result else None,
            time_ms=req.time_ms,
            actions=req.actions,
            undos=req.undos,
            placements=placements,
        )
        return body

    @app.get("/api/attempts")
    def list_attempts(
        client_id: str = Query(..., alias="clientId", pattern=CLIENT_ID_PATTERN),
        puzzle_id: str | None = Query(None, alias="puzzleId"),
        limit: int = Query(50, ge=1, le=200),
    ) -> dict[str, Any]:
        return {"attempts": store.list_attempts(client_id, puzzle_id, limit)}

    @app.get("/api/progress")
    def progress(client_id: str = Query(..., alias="clientId", pattern=CLIENT_ID_PATTERN)) -> dict[str, Any]:
        return store.progress(client_id)

    # ----------------------------------------------------- built frontend (SPA)
    if settings.frontend_dist is not None:
        dist = settings.frontend_dist.resolve()

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            if path.startswith("api/"):
                raise ApiError(404, "not_found", "No such API route.")
            target = (dist / path).resolve()
            if path and re.fullmatch(r"[\w./@-]+", path) and target.is_file() and dist in target.parents:
                return FileResponse(target)
            return FileResponse(dist / "index.html")

    return app


def app_factory() -> FastAPI:
    """uvicorn entry point: `uvicorn edison_api.main:app_factory --factory`."""
    logging.basicConfig(level=logging.INFO)
    return create_app()
