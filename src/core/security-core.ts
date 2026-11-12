import { UploadSecurityScanner } from "./scanner.js";
import type { InspectionRequest, InspectionResult, ScannerConfig } from "./types.js";

export type SecurityEvent =
  | { type: "inspection_started"; transactionId: string }
  | { type: "inspection_completed"; transactionId: string; decision: InspectionResult["decision"] }
  | { type: "inspection_failed"; transactionId: string; reason: string };
export type SecurityEventHandler = (event: SecurityEvent) => void;
export type Unsubscribe = () => void;
export interface UploadSecurityCore {
  inspect(request: InspectionRequest): Promise<InspectionResult>;
  subscribe(callback: SecurityEventHandler): Unsubscribe;
  shutdown(): Promise<void>;
}
export interface UploadSecurityCoreOptions { scanner?: Partial<ScannerConfig> }

export function createUploadSecurityCore(options: UploadSecurityCoreOptions = {}): UploadSecurityCore {
  const scanner = new UploadSecurityScanner(options.scanner);
  const listeners = new Set<SecurityEventHandler>();
  let closed = false;
  const emit = (event: SecurityEvent) => { for (const fn of listeners) { try { fn(event); } catch { /* isolate listener failures */ } } };
  return {
    async inspect(request) {
      if (closed) throw new Error("Upload Security Core has been shut down.");
      const transactionId = request.transactionId ?? makeId();
      emit({ type: "inspection_started", transactionId });
      try {
        const result = await scanner.inspect({ ...request, transactionId });
        emit({ type: "inspection_completed", transactionId, decision: result.decision });
        return result;
      } catch (error) {
        emit({ type: "inspection_failed", transactionId, reason: error instanceof Error ? error.message : "Unknown inspection error" });
        throw error;
      }
    },
    subscribe(callback) { if (closed) throw new Error("Upload Security Core has been shut down."); listeners.add(callback); return () => listeners.delete(callback); },
    async shutdown() { closed = true; listeners.clear(); },
  };
}
function makeId(): string { return globalThis.crypto?.randomUUID?.() ?? `txn-${Date.now()}`; }
