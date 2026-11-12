export type Decision = "ALLOW" | "BLOCK" | "REVIEW" | "ERROR";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type FileCategory = "text" | "pdf" | "archive" | "image" | "executable" | "document" | "media" | "unknown";

export interface ScannerConfig {
  maxFileSizeBytes: number;
  maxTextScanBytes: number;
  maxPdfPages: number;
  maxPdfTextChars: number;
  pdfWorkerSrc?: string;
  pdfAssetBaseUrl?: string;
}

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  maxFileSizeBytes: 100 * 1024 * 1024,
  maxTextScanBytes: 10 * 1024 * 1024,
  maxPdfPages: 250,
  maxPdfTextChars: 10 * 1024 * 1024,
};

export interface InspectionRequest {
  file: File;
  transactionId?: string;
  source?: string;
}

export interface SecurityFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: RiskLevel;
  evidence: string;
  offset?: number;
}

export interface InspectionResult {
  transactionId: string;
  fileName: string;
  fileSize: number;
  category: FileCategory;
  detectedType: string;
  decision: Decision;
  findings: SecurityFinding[];
  coverage: { identified: boolean; contentInspected: boolean; complete: boolean; notes: string[] };
}
