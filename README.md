# CommandIQ

CommandIQ is a local-first Chromium extension proof of concept for inspecting supported uploads before the page sends them. It scans bounded text files and extracts selectable PDF text for a small set of credential and personal-data patterns. Unsupported or incomplete files return `REVIEW`; the extension blocks every result except `ALLOW`.

## Setup

```powershell
npm install
npm run typecheck
npm run diagnose:pdf
npm run build:extension
```

To load the extension in Chromium:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `dist/extension` folder.
4. After a rebuild, click the extension’s **Reload** button and reload the website tabs you want it to monitor.

The extension shows an in-page message when it blocks an upload. Its current Manifest V3 preview requests access to `<all_urls>` so it can observe supported uploads across websites.

## How an upload works

Use the website normally. CommandIQ pauses supported upload requests long enough to inspect the selected file. A fully scanned file with no findings continues automatically. A detected high-risk finding, a medium finding such as an email address, or an incomplete scan is stopped and shown in an in-page message. The current proof of concept has no user override or interactive review screen.

`npm run diagnose:pdf` is a headless command-line check of the synthetic PDFs in `test/`; it does not start a website. In the browser console, `[CommandIQ PDF diagnostic]` logs the decision, extraction coverage notes, category, and matched rule IDs without logging PDF text or finding values.

For the extension build, `npm run build:extension` bundles the content scripts and copies the PDF.js worker and support assets into `dist/extension`. No web interface or local server is required to use the extension.

## Important limits

This is a proof of concept, not a malware scanner. PDF support extracts selectable text; it does not OCR image-only pages or deeply analyze every PDF feature. Office, archive, image, and executable formats are not deeply parsed. Page-world fetch/XHR hooks are best-effort and do not guarantee coverage of workers, service workers, arbitrary streams, transformed uploads, or every website. No inspection backend is used. See [docs/PROJECT.md](docs/PROJECT.md) for architecture, scope, known limits, and roadmap.
