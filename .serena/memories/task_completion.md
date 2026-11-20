# Done checklist

- `pnpm check` passes (run `pnpm engine` first; it checks only the commit, so `git -C engine status` must be clean too; with `engine/` linked, check against the pin before trusting it).
- Changed a prepared report or a profile it uses -> update `expected` in `src/reports.ts` only if the intended action changed (never just to match a new result); the weekly examples check (README "Examples check") compares them.
- Behaviour change -> README and geolonia/pointsman `docs/fiware-demo.md` still match.
- Engine change needed -> released in geolonia/pointsman first, then `engine.json` moved to that commit.
- Nothing from the private config repo in the diff.
