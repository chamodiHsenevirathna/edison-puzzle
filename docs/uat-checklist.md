# Final user-acceptance checklist (human)

Automated tests cover mechanics; these items need human judgement. Run the app with `make run` (http://127.0.0.1:8000) in a desktop browser, and repeat the **bold** items on a phone and a tablet.

## First impression
- [ ] The landing page explains what the puzzle is within a few seconds. The look matches the intended direction (light technical paper, cobalt linework, amber fills, mono labels). Nothing feels generic-dashboard or childish.
- [ ] The twelve pieces and their sizes are correct (28×14, 21×18 ×2, 21×14 ×2, 32×11, 32×10, 28×7, 28×6, 17×14, 14×4, 10×7). Area 3,136 = 56².

## Playground
- [ ] **Select a piece, click/tap the board: the dashed preview follows the pointer, turns red when invalid, and the message after a refused placement explains why.**
- [ ] Rotate (R key and button), move a placed piece (click it, then click elsewhere or use arrows), remove (Delete / button), undo/redo (buttons and Ctrl/⌘ Z).
- [ ] Keyboard only (no mouse): Tab to the board, arrows, Enter to place, R, Delete, Esc. A screen reader announces useful state (try VoiceOver/NVDA if available).
- [ ] Occupied vs free area is clear (hatched = free). Progress, time, actions update correctly.
- [ ] **Solve the whole puzzle yourself** (the gallery shows an answer if you get stuck). The result screen appears with sensible time/actions and the "server independently checked" note. Reload mid-game: progress is restored. "Try again" starts clean.
- [ ] Mouse drag from the tray works but is never required.

## Algorithm Explorer
- [ ] "Record the solver run" streams quickly; play, pause, step ◀ ▶, scrub, change speed. Narration is understandable and matches the board (attempted dashed outline, red × for rejected).
- [ ] Jump to "Next dead end" and "Solution". Counters at the solution match the "Whole run" panel (1,102 nodes; 8,443 placements tried).
- [ ] Nothing about it feels fake or pre-canned.

## Human vs Algorithm / Solutions / Challenges / Creator
- [ ] Compare: metric definitions and the fairness note are honest and clear; the "same underlying solution" statement is correct for your run.
- [ ] Solutions: 8 arrangements, 1 family; the wording makes clear they are rotations/reflections, not different solutions.
- [ ] Challenges: each states its objective; a passed one shows Completed; a failed constraint is explained (try Steady Hands with one undo).
- [ ] Creator: try an invalid puzzle (area mismatch, oversized piece, zero size): explanations are clear. Save a valid one, ask the solver, play it, delete it. Try a balanced but impossible puzzle (3×3 with 2×2, 2×2, 1×1): "No solution exists".

## Robustness and polish
- [ ] Stop the server mid-session: pages show a clear "Server unreachable" with Try again; an already-loaded game stays playable.
- [ ] **Layout at phone/tablet widths: no horizontal scrolling, tap targets comfortable, the tray is reachable without much scrolling.**
- [ ] Reduced-motion setting (OS or Preferences) is respected. Text is readable; focus outline always visible.
- [ ] Copy: spelling, tone, and accuracy of every statement (especially the "one solution up to rotation and reflection" claim and the fairness caveats).
- [ ] Decide: is the project licence set? Is the hosting/rate-limiting plan acceptable? (see [deployment.md](deployment.md))
