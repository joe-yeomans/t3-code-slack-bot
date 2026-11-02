import { execFile } from "node:child_process";

/** Runs `t3` with the given arguments and stdin, resolving to stdout. Rejects with a readable error. */
export type RunT3 = (args: string[], stdin?: string) => Promise<string>;

const TIMEOUT_MS = 60_000;

export const runT3: RunT3 = (args, stdin) =>
  new Promise((resolve, reject) => {
    // execFile runs no shell, and the prompt goes through stdin, so Slack text can't become a flag or command.
    const child = execFile("t3", args, { timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      const notInstalled = (error as NodeJS.ErrnoException).code === "ENOENT";
      reject(new Error(notInstalled ? "The `t3` command isn't on PATH." : stderr.trim() || error.message));
    });
    child.stdin?.on("error", () => {}); // t3 exiting early is reported by the callback above.
    child.stdin?.end(stdin ?? "");
  });

/** Starts a thread and returns its id. */
export async function startThread(project: string, prompt: string, run: RunT3 = runT3): Promise<string> {
  const started = JSON.parse(await run(["thread", "start", project, "-", "--json"], prompt)) as {
    threadId?: unknown;
  };
  if (typeof started.threadId !== "string") {
    throw new Error("`t3 thread start` returned no thread id. This t3 version may be incompatible.");
  }
  return started.threadId;
}
