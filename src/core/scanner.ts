import { DEFAULT_SCANNER_CONFIG, type Decision, type FileCategory, type InspectionRequest, type InspectionResult, type RiskLevel, type ScannerConfig, type SecurityFinding } from "./types.js";
import { extractPdfText } from "./pdf-text-extractor.js";

export class UploadSecurityScanner {
  private readonly config: ScannerConfig;
  constructor(config: Partial<ScannerConfig> = {}) { this.config = { ...DEFAULT_SCANNER_CONFIG, ...config }; }

  async inspect(request: InspectionRequest): Promise<InspectionResult> {
    const { file } = request;
    const transactionId = request.transactionId ?? makeId();
    const identified = await identify(file);
    const findings: SecurityFinding[] = [];
    const notes: string[] = [];
    let contentInspected = false;
    let complete = false;
    if (file.size > this.config.maxFileSizeBytes) {
      notes.push(`File exceeds the ${this.config.maxFileSizeBytes} byte inspection limit.`);
    } else if (identified.category === "text") {
      if (file.size > this.config.maxTextScanBytes) notes.push("Text file exceeds the content scan limit.");
      else {
        const text = await file.text();
        findings.push(...scanText(text));
        contentInspected = true;
        complete = true;
      }
    } else if (identified.category === "pdf") {
      try {
        const extracted = await extractPdfText(new Uint8Array(await file.arrayBuffer()), {
          workerSrc: this.config.pdfWorkerSrc,
          assetBaseUrl: this.config.pdfAssetBaseUrl,
          maxPages: this.config.maxPdfPages,
          maxTextChars: this.config.maxPdfTextChars,
        });
        findings.push(...scanText(extracted.text));
        contentInspected = extracted.text.length > 0;
        complete = extracted.complete;
        notes.push(...extracted.notes);
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 240) : "Unknown parser error";
        notes.push(`PDF text extraction failed (${message}); the document could not be fully inspected.`);
      }
    } else {
      notes.push("This file type is identified or categorized but does not yet have a deep content parser.");
    }
    const decision: Decision = findings.some(f => f.severity === "critical" || f.severity === "high") ? "BLOCK"
      : !complete ? "REVIEW" : findings.length ? "REVIEW" : "ALLOW";
    if (identified.category === "pdf") {
      console.info("[CommandIQ PDF diagnostic]", {
        transactionId,
        fileSizeBytes: file.size,
        category: identified.category,
        detectedType: identified.type,
        decision,
        contentInspected,
        complete,
        findingRuleIds: findings.map(f => f.ruleId),
        coverageNotes: notes,
      });
    }
    return {
      transactionId, fileName: file.name, fileSize: file.size, category: identified.category,
      detectedType: identified.type, decision, findings,
      coverage: { identified: identified.identified, contentInspected, complete, notes },
    };
  }
}

async function identify(file: File): Promise<{ category: FileCategory; type: string; identified: boolean }> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const mime = file.type.toLowerCase().split(";", 1)[0].trim();
  const byExt: Record<string, [FileCategory, string]> = {
    txt: ["text", "text/plain"], csv: ["text", "text/csv"], tsv: ["text", "text/tab-separated-values"],
    md: ["text", "text/markdown"], json: ["text", "application/json"], xml: ["text", "application/xml"],
    html: ["text", "text/html"], htm: ["text", "text/html"], js: ["text", "text/javascript"], ts: ["text", "text/typescript"],
    css: ["text", "text/css"], yaml: ["text", "text/yaml"], yml: ["text", "text/yaml"],
    pdf: ["pdf", "application/pdf"], zip: ["archive", "application/zip"], docx: ["document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    xlsx: ["document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], pptx: ["document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    png: ["image", "image/png"], jpg: ["image", "image/jpeg"], jpeg: ["image", "image/jpeg"], gif: ["image", "image/gif"],
    exe: ["executable", "application/vnd.microsoft.portable-executable"], dll: ["executable", "application/vnd.microsoft.portable-executable"],
    mp3: ["media", "audio/mpeg"], mp4: ["media", "video/mp4"],
  };
  if (ext === "pdf" || mime === "application/pdf") return { category: "pdf", type: "application/pdf", identified: true };
  if (file.size >= 5) {
    const header = new TextDecoder("latin1").decode(await file.slice(0, Math.min(file.size, 1024)).arrayBuffer());
    if (header.includes("%PDF-")) return { category: "pdf", type: "application/pdf", identified: true };
  }
  const known = byExt[ext];
  const type = file.type || known?.[1] || "application/octet-stream";
  return { category: known?.[0] ?? "unknown", type, identified: Boolean(known) || Boolean(file.type) };
}

function scanText(text: string): SecurityFinding[] {
  const patterns: Array<[string, string, RegExp, RiskLevel]> = [
    ["private-key", "Private key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "critical"],
    ["aws-access-key", "Cloud access key pattern", /\bAKIA[0-9A-Z]{16}\b/g, "high"],
    ["credential-assignment", "Credential-like assignment", /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["']?[^\s"']{6,}/gi, "high"],
    // Strong, direct prompt-injection language. These patterns target instructions
    // that try to override the receiving AI's policy or expose its hidden prompt.
    ["prompt-override", "Prompt-injection instruction override", /\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier|system|developer)\s+(?:instructions?|prompts?|rules?|messages?)\b/gi, "high"],
    ["prompt-extraction", "Prompt-injection request to expose hidden instructions", /\b(?:reveal|print|show|repeat|disclose|output|return)\s+(?:your\s+)?(?:hidden\s+|full\s+|original\s+)?(?:system|developer|initial)\s+(?:prompt|instructions?|message)\b/gi, "high"],
    ["prompt-secrecy", "Prompt-injection concealment instruction", /\b(?:do\s+not|don't|never)\s+(?:tell|inform|warn|show)\s+(?:the\s+)?(?:user|reader|recipient)\b.{0,100}\b(?:instruction|prompt|secret|hidden|above)\b/gi, "high"],
    ["prompt-exfiltration", "Prompt-injection request to transmit sensitive data", /\b(?:send|email|upload|post|forward|transmit)\s+(?:all\s+)?(?:the\s+)?(?:stored\s+|available\s+|document\s+)?(?:credentials?|passwords?|api\s*keys?|secrets?|confidential\s+data|private\s+data)\b/gi, "high"],
    // Static indicator only: paired dynamic-code and outbound-network APIs are
    // suspicious, but legitimate developer files can contain the same APIs.
    ["script-dynamic-network", "Suspicious dynamic-code and network combination", /\b(?:eval|Function|atob|fromCharCode)\b[\s\S]{0,300}\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\b|\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\b[\s\S]{0,300}\b(?:eval|Function|atob|fromCharCode)\b/gi, "medium"],
    ["script-data-exfiltration", "Suspicious browser-data access and network combination", /\b(?:document\s*\.\s*cookie|localStorage|sessionStorage|navigator\s*\.\s*credentials)\b[\s\S]{0,300}\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\b|\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\b[\s\S]{0,300}\b(?:document\s*\.\s*cookie|localStorage|sessionStorage|navigator\s*\.\s*credentials)\b/gi, "medium"],
    ["email-address", "Email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "medium"],
  ];
  const out: SecurityFinding[] = [];
  for (const [ruleId, title, regex, severity] of patterns) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      out.push({ id: `${ruleId}-${match.index}`, ruleId, title, severity, evidence: redact(match[0]), offset: match.index });
      if (!match[0].length) regex.lastIndex++;
    }
  }
  return out;
}
function redact(value: string): string { return value.length < 6 ? "[REDACTED]" : `${value.slice(0, 3)}…[REDACTED]`; }
function makeId(): string { return globalThis.crypto?.randomUUID?.() ?? `txn-${Date.now()}`; }
