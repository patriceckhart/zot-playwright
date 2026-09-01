import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildToolContent,
  detectSessionName,
  formatResult,
  sanitizeSessionName,
  validateInvocation,
} from "./runtime.js";

test("sanitizes browser session names", () => {
  assert.equal(sanitizeSessionName("My Project / Web"), "my-project-web");
  assert.equal(sanitizeSessionName("..."), "zot-playwright");
});

test("uses an explicit browser session", () => {
  assert.equal(detectSessionName("/tmp", "Feature Test"), "feature-test");
});

test("accepts supported commands and string arguments", () => {
  assert.deepEqual(validateInvocation("fill", ["e5", "hello world"]), {
    command: "fill",
    args: ["e5", "hello world"],
  });
});

test("rejects unsupported commands", () => {
  assert.throws(() => validateInvocation("install-browser", []), /unsupported command/);
});

test("rejects non-string arguments", () => {
  assert.throws(() => validateInvocation("click", [5]), /array of strings/);
});

test("formats successful and failed commands", () => {
  assert.equal(formatResult({ stdout: "ok", stderr: "", exitCode: 0 }), "ok");
  assert.equal(
    formatResult({ stdout: "", stderr: "browser unavailable", exitCode: 1 }),
    "Playwright command failed with exit code 1.\nbrowser unavailable",
  );
});

test("returns explicitly named screenshots as image content", () => {
  const directory = mkdtempSync(join(tmpdir(), "zot-playwright-test-"));
  try {
    writeFileSync(join(directory, "page.png"), Buffer.from("png data"));

    assert.deepEqual(
      buildToolContent(
        "screenshot",
        ["--filename=page.png"],
        directory,
        { stdout: "saved", stderr: "", exitCode: 0 },
      ),
      [
        { type: "text", text: "saved" },
        { type: "image", mime_type: "image/png", data: Buffer.from("png data").toString("base64") },
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
