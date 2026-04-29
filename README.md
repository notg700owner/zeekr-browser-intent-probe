# Zeekr Browser Intent Probe

A static, defensive browser probe for an authorised security assessment of a Zeekr 9X rear-screen Chromium-based browser / VM environment.

The goal is to record what the built-in browser can do when a user manually taps links, including APK downloads, custom schemes, Android `intent://` links, and standard Android Settings intents.

Live deployment:

```text
https://zeekr-browser-intent-probe.g700owner.workers.dev
```

Current probe version: `1.1.0`

Build date: `2026-04-29T14:15:00Z`

## Safety Model

- This page does not exploit the browser.
- This page does not automatically open apps or settings.
- This page saves test logs to the authorised Cloudflare Worker/KV backend for shared review across browsers.
- This page also keeps a local browser copy as a fallback.
- Every probe action requires a visible manual tap.
- Only use on systems you are authorised to test.

The car browser and your Mac read/write the same shared server log. Open the Log / Report tab on your Mac to watch the car-generated log stream, then copy or download it for analysis.

## Project Structure

```text
package.json
wrangler.toml
README.md
public/
  index.html
  styles.css
  app.js
  apks/
    README.md
src/
  worker.js
```

## Deploy To Cloudflare Workers Static Assets

Install dependencies:

```bash
npm install
```

Deploy:

```bash
npx wrangler deploy
```

Or use the included script:

```bash
npm run deploy
```

For the current Cloudflare Git integration, use:

```text
Framework preset: None / Workers Static Assets
Build command: npm run build
Deploy command: npx wrangler deploy
Root directory: /
```

This is a Workers Static Assets deployment because `/api/*` handles APK URL checks and the shared server log.

## Shared Server Log

The app posts each log entry to `/api/log`. The Worker stores logs in Cloudflare KV and exposes them as JSON at `/api/logs`. Clearing the log calls `/api/clear`, which clears the shared KV log. This lets the car browser generate logs while a Mac browser views the same stream from a separate session.

The Cloudflare KV namespace binding is configured in `wrangler.toml` as `LOGS_KV`.

In non-interactive terminals, Wrangler requires a Cloudflare API token:

```bash
export CLOUDFLARE_API_TOKEN="your-token"
npm run deploy
```

Preview locally:

```bash
npm run preview
```

## Add The APK

Place the companion APK at:

```text
public/apks/zeekr-rear-recon.apk
```

Then redeploy the Pages site.

If the APK MIME type does not trigger Android installation, try downloading the file first, then opening it from the browser downloads UI or file manager if available. Cloudflare may serve unknown binary files as `application/octet-stream`, which is usually acceptable but car browsers can vary.

## How To Use In The Car

1. Open the Cloudflare Pages URL in the rear browser.
2. Review and record environment info.
3. Test the APK download link.
4. Install the companion APK if the browser and OS allow it.
5. Test `zrr://` custom scheme links after APK installation.
6. Test Android Settings intents.
7. Open the Log / Report tab.
8. Open the same URL on your Mac and use the Log / Report tab to view the shared server log.
9. Copy or download the server log JSON and send it for analysis.

## Interpreting Results

- Custom scheme opens APK: the browser can launch external handlers for that scheme.
- `intent://` opens APK: Android intent syntax is supported by the browser / OS path.
- Settings opens: the browser can reach exported Settings screens.
- Developer settings opens: useful evidence, but not equivalent to ADB being enabled.
- Nothing happens: the browser likely filters the scheme, the OS has no handler, or user activation was insufficient.
- Browser error: the browser detected the link type but refused or failed to handle it.

## Troubleshooting

- APK does not install: the browser may block APK downloads, the MIME type may not be recognised, or installation from browser sources may be disabled.
- Browser blocks downloads: use the APK test button to record the behavior, then try the downloads UI if available.
- Browser strips `intent://` URLs: copy the raw URI from the page and paste it into the address bar if the browser allows manual entry.
- `localStorage` unavailable: the app falls back to in-memory logging and shows a warning. Export before closing the page.
- Clipboard unavailable: use Download JSON or select the report text manually.
- If the Mac does not show car logs, press Refresh server log and confirm `/api/status` reports `log_configured: true`.
