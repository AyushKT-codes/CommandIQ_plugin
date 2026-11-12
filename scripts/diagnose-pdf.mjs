import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const testDir = fileURLToPath(new URL("../test/", import.meta.url));
const samplePaths = ["clean.pdf", "fake-credential.pdf", "clean-link.pdf", "dangerous-link.pdf"].map(name => resolve(testDir, name));
pdfjs.GlobalWorkerOptions.workerSrc = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
const assetBaseUrl = new URL("../node_modules/pdfjs-dist/", import.meta.url).href;
const credentialPattern = /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["']?[^\s"']{6,}/i;

for (const path of samplePaths) {
  const bytes = new Uint8Array(await readFile(path));
  let document;
  let loading;
  try {
    loading = pdfjs.getDocument({
      data: bytes, isEvalSupported: false, enableXfa: false, useSystemFonts: false, stopAtErrors: true,
      cMapUrl: new URL("cmaps/", assetBaseUrl).href, cMapPacked: true,
      standardFontDataUrl: new URL("standard_fonts/", assetBaseUrl).href,
      wasmUrl: new URL("wasm/", assetBaseUrl).href,
    });
    document = await loading.promise;
    const notes = [];
    const [javascriptActions, attachments, fields] = await Promise.all([
      document.getJSActions?.() ?? null,
      document.getAttachments?.() ?? null,
      document.getFieldObjects?.() ?? null,
    ]);
    if (javascriptActions?.size || javascriptActions?.length) notes.push("JavaScript actions");
    if (attachments?.size || attachments && Object.keys(attachments).length) notes.push("embedded attachments");
    if (fields && Object.keys(fields).length) notes.push("interactive form fields");
    const textParts = [];
    let riskyAnnotations = 0;
    for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
      const page = await document.getPage(pageNo);
      const pageAnnotations = await page.getAnnotations({ intent: "any" });
      riskyAnnotations += pageAnnotations.filter(annotation => {
        const subtype = String(annotation.subtype ?? "").toLowerCase();
        if (["fileattachment", "richmedia", "screen", "3d"].includes(subtype)) return true;
        const action = annotation.action;
        if (typeof action === "string" && !["URI", "GoTo"].includes(action)) return true;
        const actionType = typeof action === "string" ? action : action && typeof action.type === "string" ? action.type : undefined;
        if (action && typeof action === "object" && !actionType) return true;
        if (actionType && !["URI", "GoTo"].includes(actionType)) return true;
        const rawUrl = typeof annotation.unsafeUrl === "string" ? annotation.unsafeUrl : annotation.url;
        if (!rawUrl) return actionType === "URI";
        try { return !["http:", "https:", "mailto:", "tel:"].includes(new URL(rawUrl).protocol.toLowerCase()); }
        catch { return true; }
      }).length;
      const content = await page.getTextContent();
      for (const item of content.items) if (typeof item.str === "string") textParts.push(item.str);
    }
    if (riskyAnnotations) notes.push(`risky annotations/actions (${riskyAnnotations})`);
    const text = textParts.join(" ");
    if (!text.trim()) notes.push("no selectable text");
    const credentialFound = credentialPattern.test(text);
    const decision = credentialFound ? "BLOCK" : notes.length ? "REVIEW" : "ALLOW";
    console.log(JSON.stringify({ file: path.split(/[\\/]/).pop(), pages: document.numPages, extractedCharacters: text.length, credentialPatternFound: credentialFound, notes, decision }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ file: path.split(/[\\/]/).pop(), parserErrorName: error?.name ?? "Error", parserError: String(error?.message ?? error).slice(0, 240), decision: "REVIEW" }, null, 2));
  } finally {
    if (loading) await loading.destroy();
  }
}
