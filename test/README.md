# Test fixtures

- `clean.txt`: benign text expected to return `ALLOW`.
- `fake-credential.txt`: synthetic credential-like string expected to return `BLOCK`.
- `clean.pdf` and `fake-credential.pdf` are generated synthetic samples. Text-based PDFs are parsed locally; the clean sample should return `ALLOW`, and the credential sample should return `BLOCK`. Regenerate with `node scripts/make-test-pdfs.mjs`.
- `clean-link.pdf` includes an ordinary HTTPS link and should still return `ALLOW`; `dangerous-link.pdf` includes a synthetic JavaScript link and should return `REVIEW`.
- Image-only PDFs, embedded files, JavaScript actions, interactive forms, risky annotations, oversized PDFs, and extraction failures return `REVIEW` and are blocked by the preview.
- Email addresses are currently treated as medium-severity sensitive-data findings, so a resume containing an email can return `REVIEW` even when text extraction succeeded.

Only use synthetic sample data. Do not use real credentials or personal information in upload tests.
