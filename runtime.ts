import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

export const CLI_PACKAGE = "@playwright/cli@0.1.19";
export const MAX_OUTPUT_BYTES = 200_000;

export const SUPPORTED_COMMANDS = [
  "open",
  "goto",
  "snapshot",
  "find",
  "click",
  "dblclick",
  "fill",
  "type",
  "press",
  "select",
  "check",
  "uncheck",
  "hover",
  "drag",
  "drop",
  "upload",
  "eval",
  "run-code",
  "screenshot",
  "pdf",
  "console",
  "requests",
  "request",
  "request-headers",
  "request-body",
  "response-headers",
  "response-body",
  "tab-list",
  "tab-new",
  "tab-close",
  "tab-select",
  "state-save",
  "state-load",
  "cookie-list",
  "cookie-get",
  "cookie-set",
  "cookie-delete",
  "cookie-clear",
  "localstorage-list",
  "localstorage-get",
  "localstorage-set",
  "localstorage-delete",
  "localstorage-clear",
  "sessionstorage-list",
  "sessionstorage-get",
  "sessionstorage-set",
  "sessionstorage-delete",
  "sessionstorage-clear",
  "reload",
  "go-back",
  "go-forward",
  "dialog-accept",
  "dialog-dismiss",
  "resize",
  "highlight",
  "generate-locator",
  "close",
] as const;

export type SupportedCommand = (typeof SUPPORTED_COMMANDS)[number];
export type RunResult = { stdout: string; stderr: string; exitCode: number };
export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; mime_type: string; data: string };

export function sanitizeSessionName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "zot-playwright";
}

export function detectSessionName(cwd: string, explicit = process.env.PLAYWRIGHT_CLI_SESSION): string {
  if (explicit) return sanitizeSessionName(explicit);

  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return sanitizeSessionName(basename(root));
  } catch {
    // A project does not need to be a Git checkout.
  }

  return sanitizeSessionName(basename(resolve(cwd)));
}

export function artifactDirectory(session: string): string {
  const directory = join(tmpdir(), "zot-playwright", sanitizeSessionName(session));
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function validateInvocation(command: unknown, args: unknown): { command: SupportedCommand; args: string[] } {
  if (typeof command !== "string" || !SUPPORTED_COMMANDS.includes(command as SupportedCommand)) {
    throw new Error(`unsupported command: ${String(command)}`);
  }
  if (args !== undefined && (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))) {
    throw new Error("args must be an array of strings");
  }
  return { command: command as SupportedCommand, args: (args as string[] | undefined) ?? [] };
}

export function runPlaywright(
  command: SupportedCommand,
  args: string[],
  options: { cwd: string; session: string; timeoutMs?: number },
): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const cliArgs = ["--yes", CLI_PACKAGE, `-s=${options.session}`, command, ...args, "--raw"];
    const child = spawn("npx", cliArgs, {
      cwd: options.cwd,
      env: { ...process.env, PLAYWRIGHT_CLI_SESSION: options.session },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    const append = (current: Buffer, chunk: Buffer): Buffer => {
      if (current.length >= MAX_OUTPUT_BYTES) return current;
      return Buffer.concat([current, chunk.subarray(0, MAX_OUTPUT_BYTES - current.length)]);
    };

    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });

    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
    }, options.timeoutMs ?? 55_000);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveRun({ stdout: "", stderr: error.message, exitCode: 1 });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const truncated = stdout.length >= MAX_OUTPUT_BYTES || stderr.length >= MAX_OUTPUT_BYTES;
      const suffix = truncated ? "\n[output truncated]" : "";
      resolveRun({
        stdout: stdout.toString("utf8").trimEnd() + (stdout.length ? suffix : ""),
        stderr: stderr.toString("utf8").trimEnd() + (stderr.length ? suffix : ""),
        exitCode: typeof code === "number" ? code : signal ? 124 : 1,
      });
    });
  });
}

export function formatResult(result: RunResult): string {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.exitCode === 0) return output || "Command completed successfully.";
  return `Playwright command failed with exit code ${result.exitCode}.${output ? `\n${output}` : ""}`;
}

export function buildToolContent(
  command: SupportedCommand,
  args: string[],
  cwd: string,
  result: RunResult,
): ToolContent[] {
  const content: ToolContent[] = [{ type: "text", text: formatResult(result) }];
  if (command !== "screenshot" || result.exitCode !== 0) return content;

  const inline = args.find((arg) => arg.startsWith("--filename="));
  const index = args.indexOf("--filename");
  const filename = inline?.slice("--filename=".length) || (index >= 0 ? args[index + 1] : undefined);
  if (!filename) return content;

  try {
    const path = resolve(cwd, filename);
    if (statSync(path).size > 10 * 1024 * 1024) return content;
    const extension = extname(path).toLowerCase();
    const mimeType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
    content.push({ type: "image", mime_type: mimeType, data: readFileSync(path).toString("base64") });
  } catch {
    // The textual CLI result still reports the artifact path.
  }
  return content;
}
