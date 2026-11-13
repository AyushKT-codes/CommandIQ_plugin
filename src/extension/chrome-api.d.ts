declare const chrome: {
  runtime: {
    id: string;
    getURL(path: string): string;
    getManifest(): { externally_connectable?: { ids?: string[] } };
    getContexts(query: { contextTypes: string[]; documentUrls: string[] }): Promise<Array<{ documentUrl?: string }>>;
    sendMessage(message: unknown): Promise<unknown>;
    onConnectExternal: { addListener(callback: (port: ChromePort) => void): void };
    onMessage: { addListener(callback: (message: unknown, sender: { id?: string }, sendResponse: (response: unknown) => void) => boolean | void): void };
  };
  offscreen: {
    createDocument(options: { url: string; reasons: Array<"WORKERS">; justification: string }): Promise<void>;
  };
};

interface ChromePort {
  name: string;
  sender?: { id?: string };
  onMessage: { addListener(callback: (message: unknown) => void): void };
  onDisconnect: { addListener(callback: () => void): void };
  postMessage(message: unknown): void;
  disconnect(): void;
}
