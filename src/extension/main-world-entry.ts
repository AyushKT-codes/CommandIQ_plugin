import { UploadSecurityScanner } from "../core/scanner.js";
const scanner = new UploadSecurityScanner({
  pdfWorkerSrc: document.documentElement?.getAttribute("data-commandiq-pdf-worker") ?? undefined,
  pdfAssetBaseUrl: document.documentElement?.getAttribute("data-commandiq-pdf-assets") ?? undefined,
});
const scans = new WeakMap<File, Promise<boolean>>();
const originalFetch = window.fetch;
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

document.addEventListener("change", event => { const target = event.target; if (target instanceof HTMLInputElement && target.type === "file") for (const file of Array.from(target.files ?? [])) void scan(file); }, true);
document.addEventListener("drop", event => { for (const file of Array.from(event.dataTransfer?.files ?? [])) void scan(file); }, true);
document.addEventListener("paste", event => { for (const item of Array.from(event.clipboardData?.items ?? [])) { const file = item.getAsFile(); if (file) void scan(file); } }, true);

window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const body = init?.body ?? (input instanceof Request ? input.clone().body : null);
  if (!await inspectBody(body)) throw new DOMException("Upload blocked by Upload Security Guard", "AbortError");
  return originalFetch.call(this, input, init);
};

XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: unknown[]): void {
  (this as XMLHttpRequest & { __usgMethod?: string }).__usgMethod = method;
  const [async = true, username, password] = rest as [boolean?, string?, string?];
  originalOpen.call(this, method, url, async, username, password);
};
XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
  const xhr = this;
  void inspectBody(body).then(ok => { if (ok) originalSend.call(xhr, body); else { xhr.dispatchEvent(new ProgressEvent("error")); xhr.dispatchEvent(new ProgressEvent("loadend")); } });
};

async function inspectBody(body: BodyInit | Document | null | undefined): Promise<boolean> {
  if (body instanceof FormData) {
    for (const value of body.values()) if (value instanceof File && !await scan(value)) { notifyBlocked(value.name); return false; }
    return true;
  }
  if (body instanceof File) { const ok = await scan(body); if (!ok) notifyBlocked(body.name); return ok; }
  if (body instanceof Blob && body.size > 0) {
    const file = new File([body], "upload.bin", { type: body.type });
    const ok = await scan(file); if (!ok) notifyBlocked(file.name); return ok;
  }
  return true;
}
function notifyBlocked(fileName: string): void {
  document.dispatchEvent(new CustomEvent("commandiq:upload-blocked", { detail: JSON.stringify({ decision: "REVIEW_OR_BLOCK", fileName }) }));
  console.warn("CommandIQ blocked an upload", fileName);
}
function scan(file: File): Promise<boolean> {
  let result = scans.get(file);
  if (!result) { result = scanner.inspect({ file }).then(r => r.decision === "ALLOW"); scans.set(file, result); }
  return result;
}
