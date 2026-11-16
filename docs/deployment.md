# Deployment (preparation only — nothing has been deployed)

The app is a single Python process that serves the API and the built frontend. No external services, secrets or paid APIs are required.

## Build artefacts
1. Backend: `pip install .` (or `pip install -e .`); package data (`original_solutions.json`) is included.
2. Frontend: `cd frontend && npm ci && npm run build` → `frontend/dist/` (static files, hashed assets, source maps; fonts self-hosted).

## Run
```bash
EDISON_DB=/var/lib/edison/edison.sqlite3 \
EDISON_FRONTEND_DIST=/srv/edison/frontend/dist \
python -m uvicorn edison_api.main:app_factory --factory --host 0.0.0.0 --port 8000 --workers 1
```
* **Use one worker.** The solver concurrency cap (2) and cancellation state are per process; several workers multiply the cap. Scale with a bigger machine, or revisit (see handoff) before adding workers.
* The database directory must be writable and persistent. Back up the single `.sqlite3` file (plus `-wal`/`-shm` if present, or use `sqlite3 .backup`).
* Start-up seeds the built-in puzzles and computes the three warm-up puzzles' solutions (≈ 0.1 s) on first run.

## Reverse proxy requirements
* **Do not buffer** `GET /api/puzzles/*/solve/stream` (SSE): the app sends `X-Accel-Buffering: no`; for other proxies disable response buffering for `/api/`. Allow responses of ≈ 3 MB and keep-alive ≥ 30 s.
* Serve over HTTPS. No cookies are used; the browser stores an anonymous id in `localStorage`.
* No CORS configuration is needed (same origin). If the frontend is ever hosted separately, add CORS and set an API base URL (not implemented).

## Pre-deployment checklist
- [ ] Final human UAT passed ([uat-checklist.md](uat-checklist.md)).
- [ ] Choose and add a project licence (see [licensing.md](licensing.md)); none is set.
- [ ] `make check`, `make e2e` green on the release commit in CI.
- [ ] `frontend/dist` built from that commit; `EDISON_DB` on persistent storage; backup job configured.
- [ ] Reverse proxy: HTTPS, SSE not buffered, request size and timeout limits set.
- [ ] Rate limiting at the proxy (the app has a concurrency cap but no per-client rate limit; writes are unauthenticated).
- [ ] Decide retention for stored attempts/custom puzzles (there is no expiry; custom puzzles are capped at 200 in total).
- [ ] Hosting target chosen. **A container image is not provided**: none was built or tested here.
- [ ] Monitoring: process uptime and `GET /api/health`; logs go to stdout (uvicorn access log + `edison_api`).

## Not done (by design)
No deployment, no production credentials, no domain/hosting configuration, no push to GitHub.
