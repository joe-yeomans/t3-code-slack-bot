import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The parts of a Slack file object the bot uses. */
export interface SlackFile {
  name?: string;
  mimetype?: string;
  size?: number;
  url_private_download?: string;
}

export interface SlackImage {
  name: string;
  url: string;
  size: number;
  /** Who posted it, for the prompt. */
  author: string;
}

export interface SavedImage {
  path: string;
  author: string;
}

export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Picks the images that can be downloaded, keeping the most recent `MAX_IMAGES`.
 * Other file types, and images with no download link (such as external files), are left out.
 */
export function pickImages(files: { file: SlackFile; author: string }[]): {
  images: SlackImage[];
  skipped: number;
} {
  const images: SlackImage[] = [];
  let skipped = 0;
  for (const { file, author } of files) {
    if (!file.mimetype?.startsWith("image/") || !file.url_private_download) continue;
    if ((file.size ?? 0) > MAX_IMAGE_BYTES) {
      skipped++;
      continue;
    }
    images.push({ name: file.name ?? "image", url: file.url_private_download, size: file.size ?? 0, author });
  }
  const kept = images.slice(-MAX_IMAGES);
  return { images: kept, skipped: skipped + images.length - kept.length };
}

/** A file name that's safe to use on disk, prefixed with its position so names can't clash. */
export function safeFileName(index: number, name: string): string {
  const cleaned = name.replaceAll(/[^A-Za-z0-9._-]/g, "_").replace(/^[._]+/, "").slice(-80);
  return `${index + 1}-${cleaned || "image"}`;
}

/** Slack's own file hosts, so the bot token is never sent anywhere else. */
function isSlackFileUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && /(^|\.)slack(-gov)?\.com$/.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Downloads images into a new folder in the system temp directory, and returns their paths.
 * The files are left in place because the agent may open them at any point. The OS clears
 * its temp directory over time.
 */
export async function saveImages(
  images: SlackImage[],
  token: string,
  options: { fetch?: typeof fetch; dir?: string } = {},
): Promise<SavedImage[]> {
  if (images.length === 0) return [];
  const download = options.fetch ?? fetch;
  const dir = await mkdtemp(join(options.dir ?? tmpdir(), "t3-slack-"));

  return Promise.all(
    images.map(async (image, index) => {
      if (!isSlackFileUrl(image.url)) throw new Error(`Image "${image.name}" isn't hosted by Slack.`);
      // Without the files:read scope, Slack sends a sign-in page instead of the file, so check the type.
      // fetch drops the Authorization header if a redirect leads to another host.
      const response = await download(image.url, { headers: { Authorization: `Bearer ${token}` } });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.startsWith("image/")) {
        throw new Error(
          `Couldn't download image "${image.name}" from Slack (HTTP ${response.status}). Check the app has the files:read scope.`,
        );
      }
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > MAX_IMAGE_BYTES) throw new Error(`Image "${image.name}" is over 20 MB.`);

      const path = join(dir, safeFileName(index, image.name));
      await writeFile(path, data, { mode: 0o600 });
      return { path, author: image.author };
    }),
  );
}
