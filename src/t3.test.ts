import assert from "node:assert/strict";
import { test } from "node:test";
import { startThread, type RunT3 } from "./t3.ts";

test("startThread sends the prompt through stdin and returns the thread id", async () => {
  const calls: { args: string[]; stdin: string | undefined }[] = [];
  const run: RunT3 = async (args, stdin) => {
    calls.push({ args, stdin });
    return JSON.stringify({ threadId: "t1" });
  };

  assert.equal(await startThread("/p", "--not-a-flag", run), "t1");
  assert.deepEqual(calls, [{ args: ["thread", "start", "/p", "-", "--json"], stdin: "--not-a-flag" }]);
});

test("startThread passes t3 errors on", async () => {
  const run: RunT3 = async () => {
    throw new Error("No T3 Code project matches '/p'.");
  };
  await assert.rejects(startThread("/p", "x", run), /No T3 Code project matches/);
});

test("startThread rejects output with no thread id", async () => {
  await assert.rejects(startThread("/p", "x", async () => "{}"), /no thread id/);
});
