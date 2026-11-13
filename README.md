# CommandIQ

CommandIQ is a local-first Chromium extension proof of concept for inspecting supported uploads before the page sends them. It scans bounded text files for selected credentials, personal data, direct prompt-injection phrases, and a few suspicious code/API combinations. It extracts selectable PDF text and checks it with the same text rules. Unsupported or incomplete files return `REVIEW`; the extension blocks every result except `ALLOW`.

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

## How it works, in plain language

1. Use the website normally and select, drop, paste, or submit a file.
2. For supported upload paths, CommandIQ pauses the request and reads the file locally in your browser. It identifies the file, applies size limits, extracts supported text, and checks for the patterns its current rules understand. The file is not sent to a CommandIQ server.
3. If the supported scan is complete and finds nothing, the website upload continues. A high-risk finding is blocked. An uncertain finding or unsupported/incomplete scan becomes `REVIEW`; since there is no review screen yet, CommandIQ stops that upload too and shows a generic in-page message.

The current prompt-injection checks recognize a limited set of direct English phrases such as attempts to override earlier instructions or reveal hidden system instructions. Script checks are static indicators only. Neither is a guarantee that a document is safe. Office files and archives are identified but not deeply parsed yet. See [docs/PROJECT.md](docs/PROJECT.md) for the current architecture, detailed workflow, format coverage, roadmap, and limits.

`npm run diagnose:pdf` is a headless command-line check of the synthetic PDFs in `test/`; it does not start a website. In the browser console, `[CommandIQ PDF diagnostic]` logs the decision, extraction coverage notes, category, and matched rule IDs without logging PDF text or finding values.

For the extension build, `npm run build:extension` bundles the content scripts and copies the PDF.js worker and support assets into `dist/extension`. No web interface or local server is required to use the extension.

## Important limits

This is a proof of concept, not a malware scanner. PDF support extracts selectable text; it does not OCR image-only pages or deeply analyze every PDF feature. Office, archive, image, and executable formats are not deeply parsed. Page-world fetch/XHR hooks are best-effort and do not guarantee coverage of workers, service workers, arbitrary streams, transformed uploads, or every website. No inspection backend is used. See [docs/PROJECT.md](docs/PROJECT.md) for architecture, scope, known limits, and roadmap.
