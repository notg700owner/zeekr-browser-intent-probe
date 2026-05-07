# Zeekr Browser Intent Probe

A defensive, single-page browser probe for an authorised Zeekr 9X rear-screen Chromium / VM assessment.

The current pass focuses on what the rear browser itself exposes: Chromium version/build hints and threshold comparisons, platform identity, Cloudflare-observed network/TLS metadata, fixed-list internal reachability, storage persistence, download support, permissions, Web APIs, WebGL, WebGPU, WebRTC, WebAudio, V8/WASM, codecs/media, sensors/hardware surfaces, service worker/cache availability, frame policy behavior, chain viability evidence, and manual `chrome://` surface checks. Earlier APK, custom-scheme, and Android Settings probes were removed from the UI because the tested environment did not handle them usefully.

Live deployment:

```text
https://zeekr-browser-intent-probe.g700owner.workers.dev
```

Current probe version: `1.8.0`

Build date: `2026-05-07T08:02:52Z`

## Safety Model

- This page does not exploit the browser.
- This page does not automatically open apps or settings.
- The one-button probe runs non-destructive max-coverage browser capability and patch-candidate exposure checks.
- Each automatic test has a timeout so a hanging browser API cannot stop later checks from running.
- Permission-prompting checks are separated into manual buttons.
- The vulnerability-oriented checks map exposed subsystems; they do not include exploit payloads or crash tests.
- Manual `chrome://` links require a visible tap and do not change settings.
- Logs are saved to the authorised Cloudflare Worker/KV backend so the car browser and Mac browser can see the same stream.
- A local browser copy is kept as a fallback if the server log is unavailable.
- Only use on systems you are authorised to test.

## Project Structure

```text
package.json
wrangler.toml
README.md
public/
  index.html
  styles.css
  app.js
src/
  worker.js
```

## Deploy

Install dependencies:

```bash
npm install
```

Build check:

```bash
npm run build
```

Deploy to Cloudflare Workers Static Assets:

```bash
npm run deploy
```

Equivalent direct command:

```bash
npx wrangler deploy
```

For Cloudflare Git integration, use:

```text
Framework preset: None / Workers Static Assets
Build command: npm run build
Deploy command: npx wrangler deploy
Root directory: /
```

This is a Workers Static Assets deployment because `/api/*` is handled by the Worker and the static UI is served from `public/`.

In non-interactive terminals, Wrangler requires a Cloudflare API token:

```bash
export CLOUDFLARE_API_TOKEN="your-token"
npm run deploy
```

Preview locally:

```bash
npm run preview
```

## Shared Server Log

The browser posts each event to `/api/log`. The Worker stores logs in Cloudflare KV and exposes them at `/api/logs`. Clearing the log calls `/api/clear`, which clears the shared KV log.

This lets the car browser generate logs while a Mac browser watches the same stream from the Shared Log tab.

Useful endpoints:

```text
/api/status
/api/client-info
/api/request-echo
/api/log
/api/logs
/api/clear
```

The Cloudflare KV namespace binding is configured in `wrangler.toml` as `LOGS_KV`.

## How To Use In The Car

1. Open the live URL in the rear browser.
2. Press `Run browser probe`.
3. Review the `Chain viability assessment` row in the shared log.
4. If useful, manually tap selected `chrome://` surface links and record what happens.
5. Paste manual `chrome://version`, `chrome://sandbox`, `chrome://gpu`, UID, SELinux, permission, or IPC evidence into the Chain Viability Test box and press Save chain evidence.
6. Open the same URL on your Mac.
7. Use the Shared Log tab to view, copy, download, or clear the server log.

## Interpreting Results

- `user_agent` and related version hints identify the Chromium family and whether the browser presents as Android, Linux, desktop Chrome, or a kiosk shell.
- Download capability checks show browser support for constructing downloads, not a guarantee that the car browser UI will allow saving files.
- Storage results show whether `localStorage`, `sessionStorage`, cookies, IndexedDB, and cache APIs are available in the VM browser.
- Permission results show what the browser exposes through the Permissions API; they do not request dangerous access.
- WebGL, WebGPU, WebAudio, WebAssembly, and WebRTC results help map which Chromium subsystems are exposed and therefore should be checked against the vendor's exact patch level.
- Visuals/compositor, canvas/image, codecs/media, sensors, network policy, and iframe-policy smoke tests broaden subsystem coverage without exploit payloads.
- Request-header echo, legacy Chrome timing APIs, WebGL limits/precision, and service worker registration add browser-only fallback data when `chrome://` pages are blocked.
- The patch candidate matrix is not a vulnerability verdict. It marks areas where exact Chromium build and vendor backport status are required.
- The chain viability assessment compares the best visible Chromium version against `124.0.6367.60`, `124.0.6367.201`, and `124.0.6367.207`, then explicitly marks which later questions require manual evidence.
- The post-renderer boundary risk triage row separates positive sandbox-escape risk indicators from mitigations, confirmation blockers, and required non-web evidence.
- The single-button internal reachability row checks a small fixed list of localhost, loopback, and observed WebRTC-subnet URLs with short browser-side timeouts. It is not a scanner.
- `/api/client-info` records what Cloudflare observes from the browser request, including network/TLS/client-hint metadata where available.
- `chrome://` links opening successfully may reveal useful version, sandbox, GPU, policy, download, or crash pages.
- Nothing happens on an internal link usually means the browser filters it or the embedded Chromium shell blocks that surface.

## Patch Candidate Context

The probe highlights exposed subsystems related to known Chromium 124-era security update areas, including ANGLE/WebGL, Dawn/WebGPU, Visuals/rendering, V8/WebAssembly, WebAudio, codecs/media, and WebRTC. These checks are for patch triage only. A positive exposure means "verify exact build and patches", not "confirmed vulnerable".

## Chain Viability Context

The chain test is designed to answer:

```text
renderer compromise -> sandbox/process boundary -> privileged IPC/vendor surface -> shell/ADB/debug feasibility
```

Browser JavaScript can only answer the version and web-exposed-surface portions. Questions about OEM backports, Chromium sandboxing, Viz/GPU/browser process isolation, Android UID, SELinux domain, privileged vendor permissions, and privileged IPC surfaces require manual evidence from `chrome://version`, `chrome://sandbox`, `chrome://gpu`, shell/ADB, or an authorised recon APK.

The post-renderer boundary triage is not an exploit test. It estimates whether sandbox escape risk is worth deeper authorised investigation by combining exact visible Chromium version, known fixed-version thresholds, exposed renderer/GPU/V8/WebRTC/device surfaces, and browser-side mitigations such as SharedArrayBuffer and cross-origin isolation state.

Reference starting points:

- Chrome 124 release notes: https://developer.chrome.com/release-notes/124
- Chrome 124 desktop security update with CVE-2024-4671: https://chromereleases.googleblog.com/2024/05/stable-channel-update-for-desktop_9.html
- Chrome 124 desktop security update with ANGLE/Dawn fixes: https://chromereleases.googleblog.com/2024/04/stable-channel-update-for-desktop_24.html

## Troubleshooting

- Mac does not show car logs: press Refresh server log and confirm `/api/status` reports `log_configured: true`.
- Logs appear locally but not on Mac: check the car browser has network access to the live Worker URL.
- Download checks report support but the UI says downloads are unsupported: record that as a browser policy/UI restriction.
- `localStorage` unavailable: the app falls back to memory for the current page session; keep the page open until the shared log posts.
- Clipboard unavailable: use the Shared Log tab from the Mac instead of relying on the car browser clipboard.
- `chrome://` pages do not open: this is expected in many embedded or kiosk Chromium builds; record the blocked result in notes.
