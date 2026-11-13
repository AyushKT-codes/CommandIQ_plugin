import { UploadSecurityScanner } from "../core/scanner.js";

const CONNECTOR_VERSION = 1;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_CHUNK_BYTES = 128 * 1024;
const scanner = new UploadSecurityScanner({
  pdfWorkerSrc: chrome.runtime.getURL("pdf.worker.mjs"),
  pdfAssetBaseUrl: chrome.runtime.getURL(""),
});
let active: {
  requestId: string;
  file: { name: string; type: string; size: number };
  chunks: ArrayBuffer[];
  size: number;
  nextSequence: number;
} | undefined;

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isRecord(raw) || raw.target !== "commandiq-inspector") return;
  void handle(raw).then(sendResponse).catch(() => sendResponse({ ok: false, error: "Inspection failed" }));
  return true;
});

async function handle(message: Record<string, any>): Promise<Record<string, unknown>> {
  if (message.type === "begin") {
    if (message.version !== CONNECTOR_VERSION || !validRequestId(message.requestId) || active || !validFile(message.file)) return { ok: false };
    active = { requestId: message.requestId, file: message.file, chunks: [], size: 0, nextSequence: 0 };
    return { ok: true };
  }
  if (!active || message.requestId !== active.requestId) return { ok: false };
  if (message.type === "chunk") {
    if (message.sequence !== active.nextSequence || typeof message.dataBase64 !== "string") return { ok: false };
    const decoded = decodeChunk(message.dataBase64);
    if (!decoded || decoded.byteLength > MAX_CHUNK_BYTES || active.size + decoded.byteLength > active.file.size) return { ok: false };
    active.chunks.push(decoded);
    active.size += decoded.byteLength;
    active.nextSequence++;
    return { ok: true };
  }
  if (message.type === "cancel") {
    active = undefined;
    return { ok: true };
  }
  if (message.type === "finish") {
    const request = active;
    active = undefined;
    if (request.size !== request.file.size) return { ok: false };
    const file = new File(request.chunks, request.file.name, { type: request.file.type });
    request.chunks = [];
    const result = await scanner.inspect({ file, source: "external-extension-v1", transactionId: request.requestId });
    return { ok: true, result };
  }
  return { ok: false };
}

function decodeChunk(value: string): ArrayBuffer | undefined {
  if (!value.length || value.length > 180_000 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer as ArrayBuffer;
  } catch { return undefined; }
}
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function validRequestId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value); }
function validFile(value: unknown): value is { name: string; type: string; size: number } {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && value.name.length > 0 && value.name.length <= 255
    && typeof value.type === "string" && value.type.length <= 256
    && Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= MAX_FILE_SIZE;
}
