# pointsman-demo-roads (Cloudflare Worker + static page: road restriction reports checked by Pointsman before publishing; roads.demo.pointsman.net)

Canonical docs (do not duplicate): README.md (flow of a report, page, API, limits, setup, secrets list, deployment, examples check, development), CONTRIBUTING.md (DCO, small PRs, no secrets or ids). No AGENTS.md.

Source map:
- `src/index.ts` = Worker entry: `/api/*`, `/notify`, `/reviews`, `/github/*`, queue consumer, hourly cleanup. Other `src/*.ts` = broker client, GitHub App, review commands, daily limits (Durable Object `DailyLimits`), env types.
- `src/reports.ts` = prepared reports and their `expected` action (also read by `scripts/check-examples.mjs`).
- `src/work-orders.json` = status name -> publish/reject for completed Task entities.
- `site/` = the page (plain HTML/CSS/JS, no build); `site/_headers` = CSP, checked by `test/headers.test.ts`.
- `scripts/` = `fetch-engine.mjs` (`pnpm engine`), `setup.mjs` (broker subscriptions, labels), `resolve.mjs`, `work-order.mjs`, `check-examples.mjs`, `deploy-config.mjs` (builds git-ignored `wrangler.deploy.json`).
- `wrangler.jsonc` = Worker config; the KV id is kept out of it and filled in at deploy (`scripts/deploy-config.mjs`).

Cross-repo:
- `engine.json` pins a geolonia/pointsman commit; `engine/` (git-ignored) is its checkout or a link to a local clone. `src/` imports the bridge from `engine/packages/fiware/src/bridge`, so typecheck and tests need `engine/`.
- Engine docs for this demo: `docs/fiware-demo.md` (storyboard) and `bridge/README.md` in geolonia/pointsman; keep them in step when behaviour changes.
- The Worker calls a deployed Pointsman whose decision profiles live in a private repo; a profile change must be deployed there before this Worker relies on it.
- Order for a cross-repo change: merge and release in pointsman first, then a PR here moving `engine.json` to that commit; never pin an unmerged commit.

Further: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.
