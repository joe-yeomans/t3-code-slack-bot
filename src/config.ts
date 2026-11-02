import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { PROJECT_NAME } from "./parse.ts";

export interface Config {
  slackBotToken: string;
  slackAppToken: string;
  allowedUserId: string;
  defaultProject?: string;
  projectsDir?: string;
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

const T3_PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `t3` resolves relative paths against the bot's working directory, so a bare `cron` would match
 * whichever project the bot was started in. Only pass it absolute paths and project ids.
 */
function resolveDefaultProject(value: string, projectsDir: string | undefined): string {
  if (isAbsolute(value) || T3_PROJECT_ID.test(value)) return value;
  if (projectsDir && PROJECT_NAME.test(value)) return join(projectsDir, value);
  throw new Error(
    `T3_DEFAULT_PROJECT must be an absolute path, a T3 project id, or a folder name in T3_PROJECTS_DIR. Got "${value}".`,
  );
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const read = (name: string) => env[name]?.trim() || undefined;
  const required = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "ALLOWED_SLACK_USER_ID"];
  const missing = required.filter((name) => !read(name));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const allowedUserId = read("ALLOWED_SLACK_USER_ID")!;
  if (!/^[UW][A-Z0-9]+$/.test(allowedUserId)) {
    throw new Error(
      "ALLOWED_SLACK_USER_ID must be a Slack member ID like U012ABC3DEF, not a username.",
    );
  }

  const projectsDirValue = read("T3_PROJECTS_DIR");
  const projectsDir = projectsDirValue && expandHome(projectsDirValue);
  if (projectsDir && !isAbsolute(projectsDir)) {
    throw new Error(`T3_PROJECTS_DIR must be an absolute path. Got "${projectsDirValue}".`);
  }
  const defaultProjectValue = read("T3_DEFAULT_PROJECT");
  const defaultProject =
    defaultProjectValue && resolveDefaultProject(expandHome(defaultProjectValue), projectsDir);
  return {
    slackBotToken: read("SLACK_BOT_TOKEN")!,
    slackAppToken: read("SLACK_APP_TOKEN")!,
    allowedUserId,
    ...(defaultProject && { defaultProject }),
    ...(projectsDir && { projectsDir }),
  };
}
