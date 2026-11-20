# Commands

- `pnpm install`, then `pnpm engine` (fetches the pinned engine into `engine/`; do it before `pnpm check`, as CI does).
- `pnpm check` = typecheck + `vitest run` + `wrangler deploy --dry-run`; the CI gate.
- `pnpm dev` needs a git-ignored `.dev.vars` (secrets: README "Setup").
- Local bridge work: `cd` into this repo, then check `git -C engine status` (removing `engine/` discards edits in it) and run `rm -rf engine && ln -s ../pointsman engine`. Back to the pin: `rm engine && pnpm engine`. While linked, `pnpm engine` does not compare with `engine.json`; `ls -la engine` shows which one is in place.
- `node scripts/setup.mjs` after a subscription change: it creates or updates subscriptions by id, but never deletes one you removed or renamed (delete that in the broker). Other scripts: README.
