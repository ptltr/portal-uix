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
const LEGACY_REMINDER_API_BASE_URL_KEY = "uix-reminder-api-base-url";

const isValidEmail = (value: string): boolean => /\S+@\S+\.\S+/.test(value.trim());

const sessionHasMeaningfulContent = (snapshot: PersistedChatState): boolean => {
  // Only treat persisted history as resumable when it has actual conversation content.
  const hasUserMessages = (snapshot.messages || []).some(
    (msg) => msg?.role === "user" && String(msg.content || "").trim().length > 0,
  );
  return hasUserMessages || Boolean(snapshot.finalReport);
};

const parseSessionSnapshot = (value: unknown): PersistedChatState | null => {
  if (!value || typeof value !== "object") return null;

  const unwrap = (input: unknown): Record<string, unknown> | null => {
    if (!input || typeof input !== "object") return null;
    const obj = input as Record<string, unknown>;

    if (obj.snapshot && typeof obj.snapshot === "object") {
      return obj.snapshot as Record<string, unknown>;
    }

    if (obj.session && typeof obj.session === "object") {
      return obj.session as Record<string, unknown>;
    }

    return obj;
  };

  const raw = unwrap(value);
  if (!raw) return null;

  const messages = Array.isArray(raw.messages) ? raw.messages : [];
  const finalReport = typeof raw.finalReport === "string"
    ? raw.finalReport
    : (typeof raw.report === "string" ? raw.report : "");

  return {
    conversationId: typeof raw.conversationId === "number" ? raw.conversationId : null,
    messages: messages as PersistedChatState["messages"],
    isEvaluationComplete: Boolean(raw.isEvaluationComplete),
    employeeName: typeof raw.employeeName === "string" ? raw.employeeName : "",
    employeeEmail: typeof raw.employeeEmail === "string" ? raw.employeeEmail : "",
    currentStep: typeof raw.currentStep === "number" ? raw.currentStep : 0,
    finalReport,
    followUpCount: typeof raw.followUpCount === "number" ? raw.followUpCount : 0,
    isInFollowUp: Boolean(raw.isInFollowUp),
    signals: (raw.signals && typeof raw.signals === "object")
      ? (raw.signals as PersistedChatState["signals"])
      : { strengths: {}, opportunities: {} },
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
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

const getSessionLookupBaseUrls = (): string[] => {
  const urls: string[] = [];

  const primary = getApiBaseUrl();
  if (primary) urls.push(primary.replace(/\/$/, ""));

  const fromReminderEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_REMINDER_API_BASE_URL;
  if (fromReminderEnv) {
    const normalized = fromReminderEnv.replace(/\/$/, "");
    if (normalized) urls.push(normalized);
  }

  if (typeof window !== "undefined") {
    try {
      const fromStorage = localStorage.getItem(LEGACY_REMINDER_API_BASE_URL_KEY) || "";
      const normalized = fromStorage.replace(/\/$/, "");
      if (normalized) urls.push(normalized);
    } catch {
      // Ignore localStorage access errors.
    }
  }

  return Array.from(new Set(urls));
};

const getSessionScore = (snapshot: PersistedChatState | null): number => {
  if (!snapshot) return -1;
  const messagesCount = Array.isArray(snapshot.messages) ? snapshot.messages.length : 0;
  const hasReport = Boolean(snapshot.finalReport);
  const updatedAt = typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : 0;
  return (messagesCount * 1_000_000) + (hasReport ? 1_000 : 0) + updatedAt;
};

export const hasSessionByEmail = async (email: string): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const baseUrls = getSessionLookupBaseUrls();

  if (!baseUrls.length || !isValidEmail(normalized)) {
    return false;
  }

  for (const baseUrl of baseUrls) {
    const snapshot = await fetchSessionSnapshot(baseUrl, normalized);
    if (snapshot) return true;
  }

  return false;
};

export const fetchSessionByEmail = async (email: string): Promise<PersistedChatState | null> => {
  const normalized = normalizeEmail(email);
  const baseUrls = getSessionLookupBaseUrls();

  if (!baseUrls.length || !isValidEmail(normalized)) {
    return null;
  }

  let best: PersistedChatState | null = null;
  let bestScore = -1;

  for (const baseUrl of baseUrls) {
    const snapshot = await fetchSessionSnapshot(baseUrl, normalized);
    const score = getSessionScore(snapshot);
    if (score > bestScore) {
      best = snapshot;
      bestScore = score;
    }
  }

  return best;
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