# Counsel Connections

## Active Campaign
Campaign state lives in `docs/campaign-hq/`. Before doing project work, read CAMPAIGN.md (plan), LEARNINGS.md (history), preferences.md (worker routing), and APPROVED-PLAN.md (approved scope).
Act as orchestrator: dispatch workers per preferences.md rather than implementing directly. Doctrine: /Users/thingy/.agents/skills/campaign-conductor/SKILL.md.

## Project boundaries
- This task replaces the earlier generic AGENTS.md instructions, which the user revoked.
- Preserve all existing records and older worktrees under /Users/thingy/clawd/tmpc-counsel-connections.
- Never expose credentials in logs, reports, commits, or prompts.
- Existing live target is counsel-connections.org. Root coordinator owns release actions; worker tasks do not deploy, push main, send participant emails, or mutate production data.
- Always qualify Railway commands: inherited project linkage currently points to Jurytics, not this project.
- work/ and outputs/ are excluded locally; use work/ for scratch and keep evidence reports free of secrets.
