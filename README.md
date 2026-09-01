# zot-playwright

TypeScript [zot](https://www.zot.sh) extension for token-efficient browser automation through the official Playwright CLI.

It gives the agent a persistent, project-scoped browser session without adding a large browser protocol or local dependencies to the extension.

## Features

- Open and navigate pages.
- Capture concise accessibility snapshots with stable element references.
- Click, fill, type, select, check, drag, upload, and press keys.
- Inspect console messages and network requests.
- Evaluate page JavaScript when standard browser actions are insufficient.
- Manage tabs, cookies, local storage, session storage, and authentication state.
- Capture screenshots and PDFs. Explicitly named screenshots are returned to zot as image content.
- Reuse one isolated browser session per project.
- Pass arguments directly to the Playwright CLI without shell interpolation.

## Requirements

- zot 0.3.54 or newer
- Node.js 18 or newer
- `npx`

No `node_modules` directory or package installation is required. The executable uses `npx` to run TypeScript and the pinned official `@playwright/cli` package from the npm cache.

If a compatible browser is not already available, install Chromium once:

```bash
npx --yes @playwright/cli@0.1.19 install-browser chromium
```

## Run for development

```bash
zot --ext .
```

Ask zot to use the browser naturally:

```text
Open https://example.com and summarize the page.
Test the login flow at http://localhost:3000 and report console errors.
Fill the signup form, submit it, and save a screenshot to /tmp/signup.png.
```

Run `/playwright` to show the active session and artifact directory.

## Install

Install directly from GitHub:

```bash
zot ext install https://github.com/patriceckhart/zot-playwright
```

To install from a local checkout instead:

```bash
zot ext install .
```

Restart zot, or run `/reload-ext` if zot is already open.

The extension manifest invokes `index.ts` directly. Its shebang runs `npx --yes tsx`, so there is no build step and no local dependency directory.

## How it works

The extension registers one `playwright` tool with a constrained command allowlist. The agent normally follows this workflow:

1. `open` a URL.
2. `snapshot` the page to obtain references such as `e5`.
3. Use references with commands such as `click`, `fill`, or `check`.
4. Re-run `snapshot` after navigation or major page changes.
5. Use `close` when finished.

Browser sessions are named from the current Git repository or working directory. Set `PLAYWRIGHT_CLI_SESSION` before starting zot to override the name.

The Playwright CLI can create `.playwright-cli/` artifacts in the project. The slash command also reports a stable temporary artifact directory at `$TMPDIR/zot-playwright/<session>/` for explicit screenshot, PDF, trace, and state file paths.

## Test

```bash
bunx --yes tsx --test runtime.test.ts
```

Manual protocol smoke test:

```bash
printf '%s\n' \
  '{"type":"hello_ack","protocol_version":1,"zot_version":"0.3.54","provider":"test","model":"test","cwd":"/tmp"}' \
  '{"type":"command_invoked","id":"1","name":"playwright","args":""}' \
  '{"type":"shutdown"}' | ./index.ts
```

## Security

This extension launches a real browser with your user permissions. Pages can contain untrusted content, and browser state files can contain sensitive authentication data. Review destinations and artifact paths before sharing them. The command allowlist prevents package installation and browser-session-wide kill commands through the agent tool, but it is not a security sandbox.

## License

MIT. See [LICENSE](LICENSE) for the full license text.
