import { UploadSecurityScanner } from "../core/scanner.js";
const pdfWorkerUrl = chrome.runtime.getURL("pdf.worker.mjs");
const pdfAssetBaseUrl = chrome.runtime.getURL("");
document.documentElement?.setAttribute("data-commandiq-pdf-worker", pdfWorkerUrl);
document.documentElement?.setAttribute("data-commandiq-pdf-assets", pdfAssetBaseUrl);
const scanner = new UploadSecurityScanner({ pdfWorkerSrc: pdfWorkerUrl, pdfAssetBaseUrl });
const busy = new WeakSet<HTMLFormElement>();
const replay = new WeakSet<HTMLFormElement>();

document.addEventListener("commandiq:upload-blocked", event => {
  const detail = (event as CustomEvent<string>).detail;
  let decision = "REVIEW";
  try { decision = JSON.parse(detail).decision ?? decision; } catch { /* use safe default */ }
  showBlockedPopup(decision);
});

document.addEventListener("submit", event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || replay.delete(form) || !hasFiles(form)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (busy.has(form)) return;
  busy.add(form);
  const files = collectFiles(form);
  void Promise.all(files.map(file => scanner.inspect({ file, source: "form" }))).then(results => {
    if (results.every(result => result.decision === "ALLOW") && form.isConnected && sameFiles(files, collectFiles(form))) {
      replay.add(form);
      const submitter = (event as SubmitEvent).submitter;
      if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) form.requestSubmit(submitter);
      else form.requestSubmit();
    } else showBlockedPopup(results[0]?.decision ?? "ERROR");
  }).catch(() => showBlockedPopup("ERROR")).finally(() => busy.delete(form));
}, true);

function hasFiles(form: HTMLFormElement): boolean { return form.method.toLowerCase() !== "get" && form.enctype.toLowerCase() === "multipart/form-data" && collectFiles(form).length > 0; }
function collectFiles(form: HTMLFormElement): File[] { return Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]')).flatMap(input => Array.from(input.files ?? [])); }
function sameFiles(a: File[], b: File[]): boolean { return a.length === b.length && a.every((f, i) => f === b[i]); }
function showBlockedPopup(decision: string): void {
  if (document.getElementById("usg-blocked-popup")) return;
  const style = document.createElement("style");
  style.textContent = `#usg-blocked-popup{position:fixed;inset:0;z-index:2147483647;background:#10182899;display:grid;place-items:center;font:16px system-ui,sans-serif;color:#101828}#usg-blocked-popup .usg-card{box-sizing:border-box;width:min(440px,calc(100vw - 32px));padding:24px;border-radius:12px;background:#fff;box-shadow:0 16px 48px #0004}#usg-blocked-popup h2{margin:0 0 10px;font-size:20px}#usg-blocked-popup p{line-height:1.5;margin:0 0 18px}#usg-blocked-popup button{border:0;border-radius:7px;background:#b42318;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}`;
  const overlay = document.createElement("div"); overlay.id = "usg-blocked-popup"; overlay.setAttribute("role", "alertdialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-labelledby", "usg-blocked-title");
  const card = document.createElement("section"); card.className = "usg-card";
  const title = document.createElement("h2"); title.id = "usg-blocked-title"; title.textContent = "CommandIQ: Document cannot be uploaded";
  const message = document.createElement("p");
  message.textContent = decision === "REVIEW_OR_BLOCK"
    ? "CommandIQ stopped this upload because the file could not be cleared by the current inspection policy."
    : `CommandIQ stopped this upload because inspection returned ${decision}.`;
  const close = document.createElement("button"); close.type = "button"; close.textContent = "Close"; close.addEventListener("click", () => { overlay.remove(); style.remove(); });
  card.append(title, message, close); overlay.append(card); document.documentElement.append(style, overlay); close.focus();
}
