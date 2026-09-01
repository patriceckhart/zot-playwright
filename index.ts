#!/usr/bin/env -S npx --yes tsx

import { createInterface } from "node:readline";
import { stderr, stdin, stdout } from "node:process";
import {
  SUPPORTED_COMMANDS,
  artifactDirectory,
  buildToolContent,
  detectSessionName,
  runPlaywright,
  validateInvocation,
} from "./runtime.js";

type Frame = { type?: string; [key: string]: unknown };

const NAME = "playwright";
const VERSION = "0.1.0";
let cwd = process.cwd();
let session = "zot-playwright";
let ready = false;

function send(frame: object): void {
  stdout.write(`${JSON.stringify(frame)}\n`);
}

function log(message: string): void {
  stderr.write(`[${NAME}] ${message}\n`);
}

send({ type: "hello", name: NAME, version: VERSION, capabilities: ["commands", "tools"] });

const rl = createInterface({ input: stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let frame: Frame;
  try {
    frame = JSON.parse(line) as Frame;
  } catch (error) {
    log(`invalid JSON from host: ${String(error)}`);
    return;
  }

  if (frame.type === "hello_ack") {
    cwd = typeof frame.cwd === "string" && frame.cwd ? frame.cwd : cwd;
    session = detectSessionName(cwd);
    register();
    return;
  }
  if (frame.type === "tool_call" && frame.name === "playwright") {
    void handleToolCall(frame);
    return;
  }
  if (frame.type === "command_invoked" && frame.name === "playwright") {
    handleCommand(frame);
    return;
  }
  if (frame.type === "shutdown") {
    send({ type: "shutdown_ack" });
    rl.close();
  }
});
rl.on("close", () => process.exit(0));

function register(): void {
  if (ready) return;
  ready = true;
  send({
    type: "register_command",
    name: "playwright",
    description: "show Playwright browser automation status and usage",
  });
  send({
    type: "register_tool",
    name: "playwright",
    description:
      "Control a persistent browser with Playwright CLI. Start with open, then use snapshot to get refs such as e5 before click/fill/check. Use args exactly as CLI arguments, for example {command:'open',args:['https://example.com']}, {command:'fill',args:['e5','text']}, {command:'screenshot',args:['--filename=/tmp/page.png']}. Prefer snapshot/find and standard actions; use eval or run-code only when necessary. The browser session is shared across calls for this project.",
    schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: SUPPORTED_COMMANDS,
          description: "Playwright CLI command to run",
        },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Ordered command arguments and flags. Pass each argument as a separate string.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  });
  send({ type: "ready" });
  log(`connected for ${cwd} (session ${session})`);
}

async function handleToolCall(frame: Frame): Promise<void> {
  const id = String(frame.id ?? "");
  try {
    const input = frame.args && typeof frame.args === "object" ? frame.args as Record<string, unknown> : {};
    const invocation = validateInvocation(input.command, input.args);
    const result = await runPlaywright(invocation.command, invocation.args, { cwd, session });
    send({
      type: "tool_result",
      id,
      content: buildToolContent(invocation.command, invocation.args, cwd, result),
      is_error: result.exitCode !== 0,
    });
  } catch (error) {
    send({
      type: "tool_result",
      id,
      content: [{ type: "text", text: `Invalid Playwright request: ${error instanceof Error ? error.message : String(error)}` }],
      is_error: true,
    });
  }
}

function handleCommand(frame: Frame): void {
  const id = String(frame.id ?? "");
  const artifacts = artifactDirectory(session);
  send({
    type: "command_response",
    id,
    action: "display",
    display: `Playwright browser automation is ready.\nSession: ${session}\nArtifacts: ${artifacts}\n\nAsk the agent to open a URL or test a browser flow.`,
  });
}
