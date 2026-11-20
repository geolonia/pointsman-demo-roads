# Done checklist

- `pnpm check` passes (run `pnpm engine` first; with `engine/` linked, check against the pin before trusting it).
- Changed a prepared report or a profile it uses -> update `expected` in `src/reports.ts`; the weekly examples check (README "Examples check") compares them.
- Behaviour change -> README and geolonia/pointsman `docs/fiware-demo.md` still match.
- Engine change needed -> released in geolonia/pointsman first, then `engine.json` moved to that commit.
- Nothing from the private config repo in the diff.
