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
    saveImages: async (images) => (
      log.push("saveImages"), images.map((image, i) => ({ path: `/tmp/t3-slack-x/${i + 1}-${image.name}`, author: image.author }))
    ),
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

test("app message blocks in a thread reach the prompt", async () => {
  const { deps, prompts } = fakeDeps({
    threadMessages: async () => [
      {
        username: "Sentry",
        text: "New issue",
        blocks: [{ type: "section", text: { type: "mrkdwn", text: "TypeError in <https://s.io/1|checkout>" } }],
      },
      { user: "UJOE", text: "<@UBOT> fix it" },
    ],
  });
  await handleMention(event({ thread_ts: "0.5" }), "UBOT", config, deps);
  assert.match(prompts[0]!, /\[Sentry\] New issue\nTypeError in checkout \(https:\/\/s\.io\/1\)\n\[Joe\]/);
});

const screenshot = (name: string) => ({
  name,
  mimetype: "image/png",
  size: 10,
  url_private_download: `https://files.slack.com/${name}`,
});

test("images on the mention are saved and listed in the prompt", async () => {
  const { deps, prompts } = fakeDeps();
  await handleMention(event({ files: [screenshot("bug.png")] }), "UBOT", config, deps);
  assert.match(prompts[0]!, /Images from Slack, saved on this machine\. Open them to see them:\n- \/tmp\/t3-slack-x\/1-bug\.png \(from Joe\)$/);
});

test("images from the whole thread are included", async () => {
  const { deps, prompts } = fakeDeps({
    threadMessages: async () => [
      { user: "USAM", text: "look", files: [screenshot("sam.png")] },
      { user: "UJOE", text: "<@UBOT> fix it", files: [screenshot("joe.png")] },
    ],
  });
  await handleMention(event({ thread_ts: "0.5", files: [screenshot("joe.png")] }), "UBOT", config, deps);
  assert.match(prompts[0]!, /1-sam\.png \(from Sam\)\n- \/tmp\/t3-slack-x\/2-joe\.png \(from Joe\)$/);
});

test("no images means no download and no image section", async () => {
  const { deps, log, prompts } = fakeDeps();
  await handleMention(event(), "UBOT", config, deps);
  assert.equal(log.includes("saveImages"), false);
  assert.doesNotMatch(prompts[0]!, /Images/);
});

test("a failed image download fails the start", async () => {
  const { deps, log } = fakeDeps({
    saveImages: async () => {
      throw new Error("Couldn't download image");
    },
  });
  await handleMention(event({ files: [screenshot("bug.png")] }), "UBOT", config, deps);
  assert.deepEqual(log.slice(-2), ["error:Couldn't download image", "react:x"]);
  assert.equal(log.includes("startThread"), false);
});
