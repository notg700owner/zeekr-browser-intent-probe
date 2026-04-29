# Zeekr Browser Intent Probe

A static, defensive browser probe for an authorised security assessment of a Zeekr 9X rear-screen Chromium-based browser / VM environment.

The goal is to record what the built-in browser can do when a user manually taps links, including APK downloads, custom schemes, Android `intent://` links, and standard Android Settings intents.

## Safety Model

- This page does not exploit the browser.
- This page does not automatically open apps or settings.
- This page does not upload data anywhere.
- This page stores logs locally in the browser.
- Every probe action requires a visible manual tap.
- Only use on systems you are authorised to test.

Because this is a static Cloudflare Pages site with no backend, reports are local to each browser. To inspect a report on your Mac, copy or download the report from the car browser, then paste/import it into the Log / Report tab on your Mac.

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
```

## Deploy To Cloudflare Pages

Install dependencies:

```bash
npm install
```

Deploy:

```bash
npx wrangler pages deploy public --project-name zeekr-browser-intent-probe
```

Or use the included script:

```bash
npm run deploy
```

For Cloudflare Pages Git integration, use:

```text
Framework preset: None
Build command: npm run build
Build output directory: public
Root directory: /
```

Do not use `npx wrangler deploy` as the deploy command. That command targets Workers, not this static Pages site.

In non-interactive terminals, Wrangler requires a Cloudflare API token:

```bash
export CLOUDFLARE_API_TOKEN="your-token"
npm run deploy
```

Preview locally:

```bash
npm run preview
```

The Cloudflare Pages output directory is:

```text
public
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
8. Copy or download the report JSON.
9. Paste/import the report JSON on your Mac or send it for analysis.

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
- Mac cannot see car logs automatically: this is expected. The probe intentionally has no backend upload path.
