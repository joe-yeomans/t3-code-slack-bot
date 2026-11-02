import { statSync } from "node:fs";
import { join } from "node:path";

export interface Mention {
  projectName?: string;
  task: string;
}

/** Removes the bot's own mention, then reads a project:<name> prefix if one starts the message. */
export function parseMention(text: string, botUserId: string | undefined): Mention {
  const withoutBot = botUserId
    ? text.replace(new RegExp(`<@${botUserId}(\\|[^>]*)?>`, "g"), "")
    : text.replace(/^\s*<@[A-Z0-9]+(\|[^>]*)?>/, "");
  const trimmed = withoutBot.trim();

  const prefix = /^project:(\S+)\s*/.exec(trimmed);
  if (!prefix) return { task: trimmed };
  return { projectName: prefix[1]!, task: trimmed.slice(prefix[0].length) };
}

export const PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type ProjectResult = { ok: true; project: string } | { ok: false; error: string };

export function resolveProject(
  projectName: string | undefined,
  options: { defaultProject?: string; projectsDir?: string },
): ProjectResult {
  if (projectName === undefined) {
    return options.defaultProject
      ? { ok: true, project: options.defaultProject }
      : { ok: false, error: "Which project? Try `@t3 project:<name> <task>`." };
  }
  if (!PROJECT_NAME.test(projectName)) {
    return { ok: false, error: "Project names can only use letters, numbers, `.`, `_` and `-`." };
  }
  if (!options.projectsDir) {
    return { ok: false, error: "`project:<name>` needs `T3_PROJECTS_DIR` to be set." };
  }

  const project = join(options.projectsDir, projectName);
  if (!statSync(project, { throwIfNoEntry: false })?.isDirectory()) {
    return { ok: false, error: `There's no \`${projectName}\` folder in the projects directory.` };
  }
  return { ok: true, project };
}
