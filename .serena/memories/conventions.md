# Conventions

Authoritative: CONTRIBUTING.md. Key ones agents trip on:
- Public repo: no secrets, account ids, resource ids or private-config contents in code, issues, PRs or commits (the KV id is injected by `scripts/deploy-config.mjs`).
- English in issues, PRs and commits; DCO sign-off (`git commit -s`); small PRs.
- New script, style or map host on the page -> add it to `site/_headers`.
- Visitor-facing text calls the bridge "connector" and the Worker "the demo's server"; the developer view adds the technical names.
- Free text from visitors never goes to GitHub; only prepared reports get issues.
- Issues labelled `demo` are the demo's own review queue, opened and closed by the Worker.
