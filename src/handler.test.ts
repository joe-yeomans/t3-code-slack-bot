import assert from "node:assert/strict";
import { test } from "node:test";
import type { Config } from "./config.ts";
import { handleMention, type Deps, type MentionEvent } from "./handler.ts";

const config: Config = {
  slackBotToken: "x",
  slackAppToken: "x",
  allowedUserId: "UJOE",
  defaultProject: "/p",
};

function fakeDeps(overrides: Partial<Deps> = {}) {
  const log: string[] = [];
  const prompts: string[] = [];
  const deps: Deps = {
    react: async (emoji) => void log.push(`react:${emoji}`),
    threadMessages: async () => (log.push("threadMessages"), []),
    permalink: async () => (log.push("permalink"), "https://s/p"),
    userName: async (id) => (log.push("userName"), id === "UJOE" ? "Joe" : "Sam"),
    startThread: async (_project, prompt) => {
      log.push("startThread");
      prompts.push(prompt);
      return "t1";
    },
    logError: (message) => void log.push(`error:${message}`),
    ...overrides,
  };
  return { deps, log, prompts };
}

const event = (fields: Partial<MentionEvent> = {}): MentionEvent => ({
  user: "UJOE",
  text: "<@UBOT> fix it",
  ts: "1.0",
  channel: "C1",
  ...fields,
});

test("anyone else is ignored without a single call", async () => {
  const { deps, log } = fakeDeps();
  await handleMention(event({ user: "USAM" }), "UBOT", config, deps);
  await handleMention(event({ user: undefined }), "UBOT", config, deps);
  assert.deepEqual(log, []);
});

test("the allowed user starts a thread and gets a tick reaction", async () => {
  const { deps, log, prompts } = fakeDeps();
  await handleMention(event(), "UBOT", config, deps);
  assert.equal(prompts[0], "fix it\n\nRequested by Joe in Slack: https://s/p");
  assert.equal(log.at(-1), "react:white_check_mark");
  assert.equal(log.some((entry) => entry.includes("http://")), false);
});

test("thread replies are included as context", async () => {
  const { deps, prompts } = fakeDeps({
    threadMessages: async () => [
      { user: "USAM", text: "it broke" },
      { user: "UJOE", text: "<@UBOT> fix it" },
    ],
  });
  await handleMention(event({ thread_ts: "0.5" }), "UBOT", config, deps);
  assert.match(prompts[0]!, /\[Sam\] it broke\n\[Joe\] @Sam fix it/);
});

test("a bare mention gets a cross and starts nothing", async () => {
  const { deps, log } = fakeDeps();
  await handleMention(event({ text: "<@UBOT>" }), "UBOT", config, deps);
  assert.equal(log.includes("startThread"), false);
  assert.deepEqual(log, [`error:No task given. Usage: \`@t3 [project:<name>] <task>\`.`, "react:x"]);
});

test("no project available gets a cross and starts nothing", async () => {
  const { deps, log } = fakeDeps();
  const { defaultProject: _unused, ...noDefault } = config;
  await handleMention(event(), "UBOT", noDefault, deps);
  assert.equal(log.includes("startThread"), false);
  assert.match(log[0]!, /^error:Which project/);
  assert.equal(log[1], "react:x");
});

test("t3 failures get a cross in Slack and the reason in the log", async () => {
  const { deps, log } = fakeDeps({
    startThread: async () => {
      throw new Error("No T3 Code project matches '/p'.");
    },
  });
  await handleMention(event(), "UBOT", config, deps);
  assert.deepEqual(log, ["userName", "permalink", "error:No T3 Code project matches '/p'.", "react:x"]);
});

test("failed name and permalink lookups don't stop the thread", async () => {
  const { deps, prompts } = fakeDeps({
    userName: async () => {
      throw new Error("missing_scope");
    },
    permalink: async () => {
      throw new Error("nope");
    },
  });
  await handleMention(event(), "UBOT", config, deps);
  assert.equal(prompts[0], "fix it\n\nRequested by UJOE in Slack");
});

test("a failed Slack reaction after starting isn't reported as a failed start", async () => {
  const { deps, log } = fakeDeps({
    react: async () => {
      throw new Error("slack down");
    },
  });
  await assert.rejects(handleMention(event(), "UBOT", config, deps), /slack down/);
  assert.equal(log.includes("startThread"), true);
  assert.equal(log.some((entry) => entry.startsWith("error:")), false);
});
