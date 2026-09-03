# Worker routing preferences
- User request: use the campaign skill; approved complete implementation and push live.
- Claude Opus conductor and UI/design/review judgment, high effort. No Fable capability is advertised by this installed Claude CLI.
- Implementation, tests, debugging: Codex CLI with configured model; highest supported configured reasoning. Use isolated worktrees, committed output, self-contained briefs, and schema reports.
- Root Codex coordinator owns live release and validates conductor evidence independently. Native Codex agent release_preflight owns scratch infrastructure checks.
- Cap implementation writers to 3 concurrent tasks, with one writer per worktree. Do not create Codex app tasks.
- Preflight: Codex CLI 0.144.1, authenticated via ChatGPT. Claude CLI 2.1.7; connectivity probe pending. GitHub CLI authenticated as thingy-01. CodeRabbit CLI 0.7.5 authenticated.
- Permission envelope: current desktop task is full filesystem/network access with no approval prompts. Claude subprocess uses explicit allowed tools and no-interactive-approval mode. Codex writers use workspace-write, approval_policy=never, network enabled, add writable git common dir as needed. Never ignore rules/hooks or retry rejected actions by disabling controls.
- Preserve exact rollout boundaries: implemented vs reviewed vs integrated vs landed vs deployed vs live verified.
- Continue autonomously. User already approved plan; do not repeat approval gates for ordinary code, tests, Git pushes, or live deployment. Do not send participant notifications during rollout.
