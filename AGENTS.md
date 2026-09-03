# AGENTS

## Repository Preferences

- Keep logic segmented and componentized where possible.
- Prefer small utility modules for self-contained logic instead of keeping everything in runtime entry files.
- For extension runtime files such as scripts/background.ts, keep orchestration there and move reusable processing logic into scripts/**/*.
- When adding non-trivial logic, consider whether it should be extracted into a dedicated file before finalizing changes.
- Avoid multiple sources of truth unless there is a clear technical reason; prefer one canonical location/strategy.
