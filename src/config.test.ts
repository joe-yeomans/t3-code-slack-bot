import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "./config.ts";

const base = { SLACK_BOT_TOKEN: "b", SLACK_APP_TOKEN: "a", ALLOWED_SLACK_USER_ID: "U012ABC" };

test("loadConfig names missing variables", () => {
  assert.throws(() => loadConfig({ SLACK_BOT_TOKEN: "b" }), /SLACK_APP_TOKEN, ALLOWED_SLACK_USER_ID/);
});

test("loadConfig rejects a username in place of a member ID", () => {
  assert.throws(() => loadConfig({ ...base, ALLOWED_SLACK_USER_ID: "joe" }), /member ID/);
});

test("loadConfig treats blank optional values as unset and expands ~", () => {
  const config = loadConfig({ ...base, T3_DEFAULT_PROJECT: "", T3_PROJECTS_DIR: "~/dev" });
  assert.equal(config.defaultProject, undefined);
  assert.equal(config.projectsDir, join(homedir(), "dev"));
});

test("a bare T3_DEFAULT_PROJECT is a folder in T3_PROJECTS_DIR, never relative to the bot", () => {
  const config = loadConfig({ ...base, T3_DEFAULT_PROJECT: "cron", T3_PROJECTS_DIR: "/dev" });
  assert.equal(config.defaultProject, join("/dev", "cron"));
});

test("a bare or relative T3_DEFAULT_PROJECT is rejected without a usable T3_PROJECTS_DIR", () => {
  assert.throws(() => loadConfig({ ...base, T3_DEFAULT_PROJECT: "cron" }), /T3_DEFAULT_PROJECT must be/);
  assert.throws(
    () => loadConfig({ ...base, T3_DEFAULT_PROJECT: "../cron", T3_PROJECTS_DIR: "/dev" }),
    /T3_DEFAULT_PROJECT must be/,
  );
});

test("absolute paths, ~ and project ids pass through as T3_DEFAULT_PROJECT", () => {
  const id = "42edd687-67b2-4926-91c6-296f447590eb";
  assert.equal(loadConfig({ ...base, T3_DEFAULT_PROJECT: "/dev/cron" }).defaultProject, "/dev/cron");
  assert.equal(loadConfig({ ...base, T3_DEFAULT_PROJECT: "~/cron" }).defaultProject, join(homedir(), "cron"));
  assert.equal(loadConfig({ ...base, T3_DEFAULT_PROJECT: id }).defaultProject, id);
});

test("a relative T3_PROJECTS_DIR is rejected", () => {
  assert.throws(() => loadConfig({ ...base, T3_PROJECTS_DIR: "dev" }), /T3_PROJECTS_DIR must be/);
});
