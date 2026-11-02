import { App } from "@slack/bolt";
import { loadConfig } from "./config.ts";
import { createFirstSeen } from "./dedupe.ts";
import { handleMention, type SlackMessage } from "./handler.ts";
import { startThread } from "./t3.ts";

const config = loadConfig(process.env);

const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

const firstSeen = createFirstSeen();

app.event("app_mention", async ({ event, client, context, logger }) => {
  // Slack redelivers events it thinks were missed, and a repeat would start a duplicate agent.
  if (!firstSeen(`${event.channel}:${event.ts}`)) return;

  await handleMention(event, context.botUserId, config, {
    react: async (emoji) => {
      await client.reactions.add({ channel: event.channel, timestamp: event.ts, name: emoji });
    },
    threadMessages: async (channel, ts) => {
      const messages: SlackMessage[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.conversations.replies({
          channel,
          ts,
          limit: 200,
          ...(cursor && { cursor }),
        });
        messages.push(...((page.messages ?? []) as SlackMessage[]));
        cursor = page.response_metadata?.next_cursor || undefined;
      } while (cursor);
      return messages;
    },
    permalink: async (channel, ts) =>
      (await client.chat.getPermalink({ channel, message_ts: ts })).permalink,
    userName: async (id) => {
      const { user } = await client.users.info({ user: id });
      return user?.profile?.display_name || user?.real_name || user?.name;
    },
    startThread: (project, prompt) => startThread(project, prompt),
    logError: (message) => logger.error(message),
  }).catch((error) => logger.error(error));
});

await app.start();
console.log("T3 Slack bot is running in Socket Mode.");
