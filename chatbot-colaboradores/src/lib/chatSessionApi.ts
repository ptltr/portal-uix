import type { PersistedChatState } from "@/hooks/use-chat";

const isAppsScriptEndpoint = (url: string): boolean => {
  return /script\.google\.com\/macros\/s\/.+\/exec/.test(url);
};

const buildAppsScriptUrl = (baseUrl: string, action: string, params?: Record<string, string>): string => {
  const url = new URL(baseUrl);
  url.searchParams.set("action", action);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
};

const callAppsScriptPost = async <T>(baseUrl: string, action: string, payload: unknown): Promise<T> => {
  const body = new URLSearchParams();
  body.set("action", action);
  body.set("payload", JSON.stringify(payload));

  const response = await fetch(baseUrl, { method: "POST", body });
  if (!response.ok) {
    throw new Error(`Apps Script request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const getApiBaseUrl = (): string => {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL;
  if (fromEnv) {
    const normalized = fromEnv.replace(/\/$/, "");

    if (typeof window !== "undefined") {
      const isLocalApi = /127\.0\.0\.1|localhost/.test(normalized);
      const isLocalHost = /127\.0\.0\.1|localhost/.test(window.location.hostname);
      if (!(isLocalApi && !isLocalHost)) {
        return normalized;
      }
    } else {
      return normalized;
    }
  }

  if (typeof window === "undefined") return "";

  // In Codespaces, forwarded hosts usually encode the port in the subdomain.
  // This fallback maps the frontend port host to backend port 3000 automatically.
  const host = window.location.host;
  const protocol = window.location.protocol;
  const codespacesHost = host.replace(/-\d+\./, "-3000.");
  if (codespacesHost !== host) {
    return `${protocol}//${codespacesHost}`.replace(/\/$/, "");
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `${protocol}//${window.location.hostname}:3000`;
  }

  return "";
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const isValidEmail = (value: string): boolean => /\S+@\S+\.\S+/.test(value.trim());

const sessionHasMeaningfulContent = (snapshot: PersistedChatState): boolean => {
  // Only treat persisted history as resumable when it has actual conversation content.
  return snapshot.messages.length > 0 || Boolean(snapshot.finalReport);
};

const parseSessionSnapshot = (value: unknown): PersistedChatState | null => {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as PersistedChatState;
  if (!Array.isArray(snapshot.messages)) return null;
  return snapshot;
};

const fetchSessionSnapshotFromAppsScript = async (baseUrl: string, email: string): Promise<PersistedChatState | null> => {
  try {
    const response = await fetch(buildAppsScriptUrl(baseUrl, "getChatSession", { email }));
    if (response.status === 404 || !response.ok) return null;
    const parsed = parseSessionSnapshot(await response.json());
    return parsed && sessionHasMeaningfulContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const fetchSessionSnapshotFromRest = async (baseUrl: string, email: string): Promise<PersistedChatState | null> => {
  try {
    const response = await fetch(`${baseUrl}/api/chat-sessions/${encodeURIComponent(email)}`);
    if (response.status === 404 || !response.ok) return null;
    const parsed = parseSessionSnapshot(await response.json());
    return parsed && sessionHasMeaningfulContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const fetchSessionSnapshot = async (baseUrl: string, email: string): Promise<PersistedChatState | null> => {
  if (isAppsScriptEndpoint(baseUrl)) {
    const fromAppsScript = await fetchSessionSnapshotFromAppsScript(baseUrl, email);
    if (fromAppsScript) return fromAppsScript;
    return fetchSessionSnapshotFromRest(baseUrl, email);
  }

  const fromRest = await fetchSessionSnapshotFromRest(baseUrl, email);
  if (fromRest) return fromRest;
  return fetchSessionSnapshotFromAppsScript(baseUrl, email);
};

export const hasSessionByEmail = async (email: string): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const baseUrl = getApiBaseUrl();

  if (!baseUrl || !isValidEmail(normalized)) {
    return false;
  }

  const snapshot = await fetchSessionSnapshot(baseUrl, normalized);
  return Boolean(snapshot);
};

export const fetchSessionByEmail = async (email: string): Promise<PersistedChatState | null> => {
  const normalized = normalizeEmail(email);
  const baseUrl = getApiBaseUrl();

  if (!baseUrl || !isValidEmail(normalized)) {
    return null;
  }

  return fetchSessionSnapshot(baseUrl, normalized);
};

export const saveSessionByEmail = async (email: string, snapshot: PersistedChatState): Promise<void> => {
  const normalized = normalizeEmail(email);
  const baseUrl = getApiBaseUrl();

  if (!baseUrl || !isValidEmail(normalized)) {
    return;
  }

  const payload = {
    ...snapshot,
    employeeEmail: normalized,
  };

  const saveWithRest = async (): Promise<void> => {
    const response = await fetch(`${baseUrl}/api/chat-sessions/${encodeURIComponent(normalized)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to persist chat session via REST: ${response.status}`);
    }
  };

  const saveWithAppsScript = async (): Promise<void> => {
    const result = await callAppsScriptPost<unknown>(baseUrl, "upsertChatSession", {
      email: normalized,
      snapshot: payload,
    });

    // Ignore webhook-only responses that do not confirm session storage.
    if (
      !result
      || typeof result !== "object"
      || ((result as { message?: string }).message || "").toLowerCase() === "webhook_alive"
    ) {
      throw new Error("Apps Script session save did not confirm storage.");
    }

    const maybeOk = result as { ok?: boolean };
    if (maybeOk.ok === false) {
      throw new Error("Apps Script rejected session save.");
    }
  };

  if (isAppsScriptEndpoint(baseUrl)) {
    try {
      await saveWithAppsScript();
      return;
    } catch {
      await saveWithRest();
      return;
    }
  }

  try {
    await saveWithRest();
  } catch {
    await saveWithAppsScript();
  }
};