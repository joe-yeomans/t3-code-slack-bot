import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { MAX_IMAGE_BYTES, MAX_IMAGES, pickImages, safeFileName, saveImages, type SlackImage } from "./images.ts";

const png = (name: string, size = 10) => ({
  file: { name, mimetype: "image/png", size, url_private_download: `https://files.slack.com/${name}` },
  author: "Joe",
});

test("pickImages keeps downloadable images only", () => {
  const { images, skipped } = pickImages([
    png("a.png"),
    { file: { name: "notes.txt", mimetype: "text/plain", url_private_download: "https://files.slack.com/n" }, author: "Joe" },
    { file: { name: "ext.png", mimetype: "image/png" }, author: "Joe" },
    png("huge.png", MAX_IMAGE_BYTES + 1),
  ]);
  assert.deepEqual(images, [{ name: "a.png", url: "https://files.slack.com/a.png", size: 10, author: "Joe" }]);
  assert.equal(skipped, 1);
});

test("pickImages keeps the most recent images", () => {
  const files = Array.from({ length: MAX_IMAGES + 2 }, (_, i) => png(`${i}.png`));
  const { images, skipped } = pickImages(files);
  assert.equal(images.length, MAX_IMAGES);
  assert.equal(images[0]!.name, "2.png");
  assert.equal(skipped, 2);
});

test("safeFileName can't leave the folder or clash", () => {
  assert.equal(safeFileName(0, "Screen Shot 1.png"), "1-Screen_Shot_1.png");
  assert.equal(safeFileName(1, "../../etc/passwd"), "2-etc_passwd");
  assert.equal(safeFileName(2, "..."), "3-image");
});

const image = (url = "https://files.slack.com/f/a.png"): SlackImage => ({ name: "a.png", url, size: 3, author: "Sam" });

const respond = (body: BodyInit, init: ResponseInit = {}) =>
  (async () => new Response(body, { headers: { "content-type": "image/png" }, ...init })) as typeof fetch;

test("saveImages writes the images to a new temp folder", async () => {
  const base = await mkdtemp(join(tmpdir(), "images-test-"));
  try {
    let auth: string | null = null;
    const fake = (async (_url: string, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
      return new Response("png", { headers: { "content-type": "image/png" } });
    }) as typeof fetch;
    const saved = await saveImages([image()], "xoxb-1", { fetch: fake, dir: base });
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.author, "Sam");
    assert.equal(dirname(dirname(saved[0]!.path)), base);
    assert.equal(await readFile(saved[0]!.path, "utf8"), "png");
    assert.equal(auth, "Bearer xoxb-1");
  } finally {
    await rm(base, { recursive: true });
  }
});

test("saveImages does nothing when there are no images", async () => {
  assert.deepEqual(await saveImages([], "xoxb-1", { fetch: respond("") }), []);
});

test("saveImages never sends the token outside Slack", async () => {
  let called = false;
  const fake = (async () => ((called = true), new Response(""))) as typeof fetch;
  const base = await mkdtemp(join(tmpdir(), "images-test-"));
  try {
    for (const url of ["https://evil.example/a.png", "http://files.slack.com/a.png", "https://slack.com.evil.example/a"]) {
      await assert.rejects(saveImages([image(url)], "xoxb-1", { fetch: fake, dir: base }), /isn't hosted by Slack/);
    }
    assert.equal(called, false);
  } finally {
    await rm(base, { recursive: true });
  }
});

test("saveImages explains a missing files:read scope", async () => {
  const base = await mkdtemp(join(tmpdir(), "images-test-"));
  try {
    const signIn = respond("<html>", { status: 200, headers: { "content-type": "text/html" } });
    await assert.rejects(saveImages([image()], "xoxb-1", { fetch: signIn, dir: base }), /files:read/);
    const redirect = respond("", { status: 302, headers: { location: "https://slack.com/signin" } });
    await assert.rejects(saveImages([image()], "xoxb-1", { fetch: redirect, dir: base }), /HTTP 302/);
  } finally {
    await rm(base, { recursive: true });
  }
});
