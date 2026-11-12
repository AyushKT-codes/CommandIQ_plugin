import * as pdfjsModule from "pdfjs-dist/build/pdf.mjs";

const pdfjs = pdfjsModule as unknown as {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: Record<string, unknown>) => { promise: Promise<any>; destroy: () => Promise<void> };
};

export interface PdfTextResult {
  text: string;
  complete: boolean;
  notes: string[];
}

/** Extracts selectable PDF text only. It never renders or executes document content. */
export async function extractPdfText(
  data: Uint8Array,
  options: { workerSrc?: string; assetBaseUrl?: string; maxPages: number; maxTextChars: number },
): Promise<PdfTextResult> {
  const notes: string[] = [];
  if (options.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = options.workerSrc;
  else pdfjs.GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs";

  const loading = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
    stopAtErrors: true,
    cMapUrl: options.assetBaseUrl ? new URL("cmaps/", options.assetBaseUrl).href : undefined,
    cMapPacked: true,
    standardFontDataUrl: options.assetBaseUrl ? new URL("standard_fonts/", options.assetBaseUrl).href : undefined,
    wasmUrl: options.assetBaseUrl ? new URL("wasm/", options.assetBaseUrl).href : undefined,
  });
  let document: any;
  try {
    document = await loading.promise;
    if (document.numPages > options.maxPages) notes.push(`PDF exceeds the ${options.maxPages} page inspection limit.`);

    const [javascriptActions, attachments, fields] = await Promise.all([
      document.getJSActions?.() ?? null,
      document.getAttachments?.() ?? null,
      document.getFieldObjects?.() ?? null,
    ]);
    if (hasEntries(javascriptActions)) notes.push("PDF contains JavaScript actions that are not deeply analyzed.");
    if (hasEntries(attachments)) notes.push("PDF contains embedded attachments that are not inspected yet.");
    if (fields && Object.keys(fields).length) notes.push("PDF contains interactive form fields that are not deeply analyzed.");

    const chunks: string[] = [];
    let charCount = 0;
    const pageLimit = Math.min(document.numPages, options.maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const annotations = await page.getAnnotations({ intent: "any" });
      if (annotations.some(isRiskyAnnotation)) notes.push("PDF contains a risky link, action, or attachment annotation that needs review.");
      const content = await page.getTextContent();
      for (const item of content.items as Array<{ str?: string }>) {
        if (typeof item.str !== "string") continue;
        charCount += item.str.length;
        if (charCount > options.maxTextChars) {
          notes.push(`Extracted PDF text exceeds the ${options.maxTextChars} character scan limit.`);
          break;
        }
        chunks.push(item.str);
      }
      if (charCount > options.maxTextChars) break;
    }
    const text = chunks.join(" ");
    if (!text.trim()) notes.push("No selectable text was extracted; this may be an image-only or scanned PDF.");
    if (document.numPages > pageLimit) notes.push("Not all PDF pages were inspected.");
    return { text, complete: notes.length === 0, notes: [...new Set(notes)] };
  } finally {
    await loading.destroy();
  }
}

function hasEntries(value: unknown): boolean {
  if (value instanceof Map) return value.size > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function isRiskyAnnotation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const annotation = value as { subtype?: unknown; action?: unknown; url?: unknown; unsafeUrl?: unknown };
  const subtype = typeof annotation.subtype === "string" ? annotation.subtype.toLowerCase() : "";
  if (["fileattachment", "richmedia", "screen", "3d"].includes(subtype)) return true;

  const action = annotation.action;
  let actionType: string | undefined;
  if (typeof action === "string" && !["URI", "GoTo"].includes(action)) return true;
  if (typeof action === "string") actionType = action;
  if (action && typeof action === "object") {
    const rawActionType = (action as { type?: unknown }).type;
    if (typeof rawActionType !== "string" || !["URI", "GoTo"].includes(rawActionType)) return true;
    actionType = rawActionType;
  }

  const rawUrl = typeof annotation.unsafeUrl === "string" ? annotation.unsafeUrl
    : typeof annotation.url === "string" ? annotation.url : undefined;
  if (!rawUrl) return actionType === "URI";
  try {
    const protocol = new URL(rawUrl).protocol.toLowerCase();
    return !["http:", "https:", "mailto:", "tel:"].includes(protocol);
  } catch {
    return true;
  }
}
