# T3 Code Slack Bot

Start a [T3 Code](https://github.com/pingdotgg/t3code) thread by mentioning a Slack bot.

```
@t3 project:api fix the flaky login test
```

The bot reacts with ✅ when the thread starts, or ❌ if it can't, with the reason in its terminal. Results and follow-ups stay in T3 Code. It runs on your machine in Socket Mode, so it needs no public URL or database.

> Unofficial community project, not affiliated with T3 Code.

## Security

**A Slack message from the allowed user becomes an agent running on your machine.** In testing, these threads ran with `full-access`, so agents can run commands and change files without asking.

- Only the member ID in `ALLOWED_SLACK_USER_ID` can trigger the bot, so treat that Slack account as access to your machine.
- Other people's messages in a Slack thread are passed to the agent as context, which leaves it open to prompt injection.
- Agents work directly in the project folder, so they can change uncommitted work.

## Setup

You need Node 24, pnpm, and T3 Code running on the same machine with the `t3` CLI on `PATH`.

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps) using **From an app manifest**, and paste in [`manifest.yaml`](./manifest.yaml).
2. Under **Basic Information > App-Level Tokens**, generate an `xapp-` token with the `connections:write` scope.
3. Under **Install App**, install the app and copy the `xoxb-` bot token.
4. In your Slack profile, click **⋮ > Copy member ID**.
5. Configure and start the bot:

   ```bash
   git clone https://github.com/joe-yeomans/t3-code-slack-bot.git
   cd t3-code-slack-bot
   cp .env.example .env   # then fill it in
   pnpm install
   pnpm start
   ```

6. Run `/invite @t3` in a channel, then send `@t3 reply with OK`.

| Variable | Required | Description |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | Yes | Bot token (`xoxb-`) |
| `SLACK_APP_TOKEN` | Yes | App-level token (`xapp-`) |
| `ALLOWED_SLACK_USER_ID` | Yes | The one member ID allowed to use the bot |
| `T3_DEFAULT_PROJECT` | No | Used when there's no `project:` prefix: an absolute path, T3 project ID, or folder name in `T3_PROJECTS_DIR` |
| `T3_PROJECTS_DIR` | No | Absolute path to the parent folder for `project:<name>`, such as `~/dev` |

## Usage

| Message | Project used |
| --- | --- |
| `@t3 project:api fix the bug` | `<T3_PROJECTS_DIR>/api` |
| `@t3 fix the bug` | `T3_DEFAULT_PROJECT`, or ❌ if that isn't set |

Projects must already be added to T3 Code with `t3 project add <path>`. Mention the bot inside a Slack thread to include that thread's messages as context.

**Not supported:** Slack replies don't reach the T3 thread, and images and files aren't passed to the agent. Repeat deliveries from Slack are ignored for an hour, but that memory is lost on restart.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `No T3 Code project matches...` | Run `t3 project add <path>`. |
| `missing_scope` | Add the scope under **OAuth & Permissions** and reinstall the app. The thread may already have started, so check T3 Code before retrying. |
| No reaction at all | Check the bot is running and in the channel, and that `ALLOWED_SLACK_USER_ID` is your member ID. |
| "Agent" label in T3 Code | Expected, because the T3 CLI connects as an agent client. |

## Development

Run `pnpm lint`, `pnpm typecheck` and `pnpm test`. See [`AGENTS.md`](./AGENTS.md) for the code layout and project rules.

## License

[MIT](./LICENSE)
