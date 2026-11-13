const CONNECTOR_NAME = "commandiq-upload-inspection-v1";
const CONNECTOR_VERSION = 1;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_CHUNK_BASE64_CHARS = 180_000;
const allowedHostIds = new Set(chrome.runtime.getManifest().externally_connectable?.ids ?? []);
let activeRequestId: string | undefined;
let offscreenCreation: Promise<void> | undefined;

chrome.runtime.onConnectExternal.addListener(port => {
  const callerId = port.sender?.id;
  if (port.name !== CONNECTOR_NAME || !callerId || !allowedHostIds.has(callerId)) {
    port.disconnect();
    return;
  }

  let state: { requestId: string; nextSequence: number } | undefined;
  let queue = Promise.resolve();
  port.onMessage.addListener(message => {
    queue = queue.then(() => handleMessage(port, message, state)).then(nextState => { state = nextState; }).catch(() => {
      replyError(port, state?.requestId, "CONNECTOR_ERROR", "CommandIQ could not complete this inspection request.");
      if (state) void sendOffscreen({ target: "commandiq-inspector", type: "cancel", requestId: state.requestId }).catch(() => undefined);
      if (state?.requestId === activeRequestId) activeRequestId = undefined;
      state = undefined;
    });
  });
  port.onDisconnect.addListener(() => {
    if (state?.requestId) {
      void sendOffscreen({ target: "commandiq-inspector", type: "cancel", requestId: state.requestId }).catch(() => undefined);
      if (state.requestId === activeRequestId) activeRequestId = undefined;
    }
  });
});

async function handleMessage(
  port: ChromePort,
  raw: unknown,
  current: { requestId: string; nextSequence: number } | undefined,
): Promise<{ requestId: string; nextSequence: number } | undefined> {
  if (!isRecord(raw) || raw.version !== CONNECTOR_VERSION || typeof raw.type !== "string") {
    replyError(port, undefined, "BAD_MESSAGE", "Unsupported connector message.");
    return current;
  }

  if (raw.type === "begin") {
    if (current || activeRequestId) {
      replyError(port, stringOrUndefined(raw.requestId), "BUSY", "CommandIQ is already inspecting another connector request.");
      return current;
    }
    if (!validRequestId(raw.requestId) || !isRecord(raw.file) || !validFileMetadata(raw.file)) {
      replyError(port, stringOrUndefined(raw.requestId), "INVALID_FILE", "File metadata is invalid or exceeds the inspection limit.");
      return current;
    }
    await ensureOffscreenDocument();
    const response = await sendOffscreen({
      target: "commandiq-inspector", type: "begin", version: CONNECTOR_VERSION,
      requestId: raw.requestId,
      file: { name: safeFileName(raw.file.name), type: raw.file.type, size: raw.file.size },
    });
    if (!isRecord(response) || response.ok !== true) {
      replyError(port, raw.requestId, "INSPECTOR_BUSY", "The local inspection engine is not available.");
      return current;
    }
    activeRequestId = raw.requestId;
    port.postMessage({ version: CONNECTOR_VERSION, type: "ack", requestId: raw.requestId, nextSequence: 0 });
    return { requestId: raw.requestId, nextSequence: 0 };
  }

  if (!current || raw.requestId !== current.requestId) {
    replyError(port, stringOrUndefined(raw.requestId), "NO_ACTIVE_REQUEST", "Start an inspection before sending file data.");
    return current;
  }

  if (raw.type === "chunk") {
    if (raw.sequence !== current.nextSequence || typeof raw.dataBase64 !== "string" || !validBase64Chunk(raw.dataBase64)) {
      throw new Error("Invalid data chunk");
    }
    const response = await sendOffscreen({ target: "commandiq-inspector", type: "chunk", requestId: current.requestId, sequence: current.nextSequence, dataBase64: raw.dataBase64 });
    if (!isRecord(response) || response.ok !== true) throw new Error("Inspector rejected data chunk");
    port.postMessage({ version: CONNECTOR_VERSION, type: "ack", requestId: current.requestId, nextSequence: current.nextSequence + 1 });
    return { requestId: current.requestId, nextSequence: current.nextSequence + 1 };
  }

  if (raw.type === "finish") {
    const response = await sendOffscreen({ target: "commandiq-inspector", type: "finish", requestId: current.requestId });
    activeRequestId = undefined;
    if (!isRecord(response) || response.ok !== true || !isRecord(response.result)) {
      replyError(port, current.requestId, "INSPECTION_FAILED", "CommandIQ could not inspect this file.");
    } else {
      port.postMessage({ version: CONNECTOR_VERSION, type: "result", requestId: current.requestId, result: response.result });
    }
    return undefined;
  }

  if (raw.type === "cancel") {
    await sendOffscreen({ target: "commandiq-inspector", type: "cancel", requestId: current.requestId });
    activeRequestId = undefined;
    port.postMessage({ version: CONNECTOR_VERSION, type: "ack", requestId: current.requestId, cancelled: true });
    return undefined;
  }

  replyError(port, current.requestId, "UNKNOWN_MESSAGE", "Unknown connector message type.");
  return current;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenCreation) return offscreenCreation;
  offscreenCreation = (async () => {
    const url = chrome.runtime.getURL("offscreen.html");
    const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
    if (existing.length) return;
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "Run the local file scanner and PDF.js worker for an explicitly allowlisted CommandIQ extension connector request.",
    });
  })();
  try { await offscreenCreation; } finally { offscreenCreation = undefined; }
}

function sendOffscreen(message: Record<string, unknown>): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}
function replyError(port: ChromePort, requestId: string | undefined, code: string, message: string): void {
  port.postMessage({ version: CONNECTOR_VERSION, type: "error", requestId, code, message });
}
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function validRequestId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value); }
function validFileMetadata(value: Record<string, any>): boolean {
  return typeof value.name === "string" && value.name.length > 0 && value.name.length <= 1024
    && typeof value.type === "string" && value.type.length <= 256
    && Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= MAX_FILE_SIZE;
}
function safeFileName(value: string): string { return value.replace(/[\\/]/g, "_").slice(0, 255) || "upload.bin"; }
function validBase64Chunk(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CHUNK_BASE64_CHARS && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}
function stringOrUndefined(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
