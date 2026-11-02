import type { Config } from "./config.ts";
import { parseMention, resolveProject } from "./parse.ts";
import { buildPrompt, formatSlackText, slackUserIds } from "./prompt.ts";

export interface MentionEvent {
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  channel: string;
}

export interface SlackMessage {
  user?: string;
  username?: string;
  text?: string;
}

export interface Deps {
  /** Adds an emoji reaction to the message that mentioned the bot. */
  react(emoji: string): Promise<void>;
  threadMessages(channel: string, threadTs: string): Promise<SlackMessage[]>;
  permalink(channel: string, ts: string): Promise<string | undefined>;
  /** Display name for a Slack user id, or undefined if it can't be found. */
  userName(id: string): Promise<string | undefined>;
  startThread(project: string, prompt: string): Promise<string>;
  logError(message: string): void;
}

const SUCCESS = "white_check_mark"; // ✅
const FAILURE = "x"; // ❌

const USAGE = "No task given. Usage: `@t3 [project:<name>] <task>`.";

export async function handleMention(
  event: MentionEvent,
  botUserId: string | undefined,
  config: Config,
  deps: Deps,
): Promise<void> {
  // Checked before anything else: other people get no reaction and cause no Slack or t3 calls.
  if (event.user !== config.allowedUserId) return;

  const error = await startFromMention({ ...event, user: event.user }, botUserId, config, deps);
  if (error) deps.logError(error);
  await deps.react(error ? FAILURE : SUCCESS);
}

/** Returns the reason for a failure, or undefined if the thread started. */
async function startFromMention(
  event: MentionEvent & { user: string },
  botUserId: string | undefined,
  config: Config,
  deps: Deps,
): Promise<string | undefined> {
  try {
    const { projectName, task } = parseMention(event.text, botUserId);
    if (!task) return USAGE;

    const resolved = resolveProject(projectName, config);
    if (!resolved.ok) return resolved.error;

    const thread = event.thread_ts ? await deps.threadMessages(event.channel, event.thread_ts) : [];

    const ids = new Set([event.user, ...[task, ...thread.map((m) => m.text ?? "")].flatMap(slackUserIds)]);
    for (const m of thread) if (m.user) ids.add(m.user);
    const names = new Map<string, string>();
    await Promise.all(
      [...ids].map(async (id) => {
        const name = await deps.userName(id).catch(() => undefined);
        if (name) names.set(id, name);
      }),
    );

    const prompt = buildPrompt({
      task: formatSlackText(task, names),
      requester: names.get(event.user) ?? event.user,
      permalink: await deps.permalink(event.channel, event.ts).catch(() => undefined),
      // A lone message has no context beyond the task itself.
      context:
        thread.length > 1
          ? thread.map((m) => ({
              author: (m.user && names.get(m.user)) ?? m.username ?? m.user ?? "unknown",
              text: formatSlackText(m.text ?? "", names),
            }))
          : [],
    });

    await deps.startThread(resolved.project, prompt);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
