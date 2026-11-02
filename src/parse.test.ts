import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseMention, resolveProject } from "./parse.ts";

test("parseMention strips the bot mention and reads the project prefix", () => {
  assert.deepEqual(parseMention("<@UBOT> project:api fix it", "UBOT"), { projectName: "api", task: "fix it" });
  assert.deepEqual(parseMention("<@UBOT> project:api\nfix it", "UBOT"), { projectName: "api", task: "fix it" });
});

test("parseMention only treats a leading prefix as a project", () => {
  assert.deepEqual(parseMention("<@UBOT> fix project:api", "UBOT"), { task: "fix project:api" });
});

test("parseMention keeps other people's mentions", () => {
  assert.deepEqual(parseMention("hey <@UBOT> ask <@USAM>", "UBOT"), { task: "hey  ask <@USAM>" });
});

test("parseMention returns an empty task for a bare mention", () => {
  assert.equal(parseMention("<@UBOT>", "UBOT").task, "");
  assert.equal(parseMention("<@UBOT> project:api", "UBOT").task, "");
});

test("resolveProject uses the default, then errors, when there's no prefix", () => {
  assert.deepEqual(resolveProject(undefined, { defaultProject: "/p" }), { ok: true, project: "/p" });
  assert.equal(resolveProject(undefined, {}).ok, false);
});

test("resolveProject finds a folder under the projects directory", () => {
  const projectsDir = mkdtempSync(join(tmpdir(), "t3-slack-"));
  mkdirSync(join(projectsDir, "api"));
  assert.deepEqual(resolveProject("api", { projectsDir }), { ok: true, project: join(projectsDir, "api") });
  assert.equal(resolveProject("missing", { projectsDir }).ok, false);
});

test("resolveProject never leaves the projects directory", () => {
  const projectsDir = mkdtempSync(join(tmpdir(), "t3-slack-"));
  for (const name of ["..", "../..", "../etc", "/etc", "a/b", ".hidden", "-flag"]) {
    assert.equal(resolveProject(name, { projectsDir }).ok, false, name);
  }
});

test("resolveProject requires a projects directory for a prefix, even with a default", () => {
  assert.equal(resolveProject("api", { defaultProject: "/p" }).ok, false);
});
