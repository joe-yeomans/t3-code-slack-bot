# AGENTS.md

A small Slack bot that runs in Socket Mode and starts T3 Code threads with the `t3` CLI. It's deliberately simple and has no state. See `README.md` for user-facing behaviour.

## Commands

```bash
pnpm install
pnpm lint        # oxlint
pnpm typecheck   # tsc, no output files
pnpm test        # node:test
pnpm start       # needs a filled-in .env, and connects to real Slack
```

Run lint, typecheck and tests before finishing a change. CI runs the same three.

## Environment

- Use Node 24 (`.nvmrc`) and pnpm. Don't add a `package-lock.json`.
- Node runs the TypeScript directly, so there's no build step. Only use syntax Node can strip (`erasableSyntaxOnly`), so no enums or parameter properties.
- Local imports need the `.ts` extension, and type-only imports need `import type`.

## Layout

| File | Purpose |
| --- | --- |
| `src/index.ts` | Bolt app and the Slack API calls behind `Deps` |
| `src/handler.ts` | Allowlist check and mention flow, tested with fake `Deps` |
| `src/dedupe.ts` | In-memory check for repeat Slack events |
| `src/config.ts` | Reads and validates env vars, and fails at startup |
| `src/parse.ts` | `project:` prefix parsing and project resolution |
| `src/images.ts` | Picks Slack images and downloads them to a temp folder |
| `src/prompt.ts` | Slack markup cleanup, block and attachment text, and prompt building |
| `src/t3.ts` | The only code that runs the `t3` CLI |
| `manifest.yaml` | Slack app scopes and events |

## Security rules

A Slack message can start an agent with full access to the host machine, so keep these in place:

- `handleMention` checks `ALLOWED_SLACK_USER_ID` before anything else. Other users get no reaction and cause no Slack or `t3` calls.
- The allowlist compares member IDs, never usernames or display names, because those can change.
- Run `t3` with `execFile`, never a shell, and send prompts through stdin, so Slack text can't become a command or flag.
- Validate `project:<name>` against `PROJECT_NAME`, so it can't leave `T3_PROJECTS_DIR`.
- Only pass `t3` absolute paths or project IDs. It resolves relative paths against the bot's working directory, so a bare `cron` matches whichever project the bot was started in.
- Label Slack thread messages as context in the prompt, as they can come from other people.
- Only send the bot token to Slack's file hosts over HTTPS (`isSlackFileUrl`), and build image file names with `safeFileName`, so a Slack file name can't leave the temp folder.
- Never commit `.env` or put tokens in logs, fixtures or docs.

## Behaviour to keep

- **No persistent state:** no database, and no tracking of threads after they start. The only state is the short-lived dedupe memory in `src/dedupe.ts`, and images saved to `t3-slack-*` folders in the system temp directory. The bot never deletes those images, because the agent may open them at any point, so it leaves cleanup to the OS. Discuss this before changing it.
- **Slack feedback:** the bot only reacts with ✅ or ❌, and failure reasons go to the terminal log. It doesn't post messages or thread links.
- **Meaning of ✅:** the thread started, not that the agent finished. A failed reaction after a successful start must not be reported as a failed start.
- **Retries:** a repeat of the same channel and message timestamp is skipped for an hour, to avoid duplicate agent threads. This is in memory, so it resets on restart.

## When changing things

- **Slack scopes:** update `manifest.yaml` and the README. Existing installs must add the scope and reinstall the app, so mention that in your change summary.
- **Environment variables:** update `src/config.ts`, `.env.example` and the README's configuration table.
- **`t3` CLI usage:** the CLI is new and changing, so keep calls in `src/t3.ts` and check the current `t3 thread --help`. Don't start real threads to test unless asked, because they run real agents and appear in the user's T3 Code.
- **Tests:** add them next to the code as `*.test.ts`, and don't call real Slack or `t3`. Use the injected `Deps` and `RunT3` fakes.
