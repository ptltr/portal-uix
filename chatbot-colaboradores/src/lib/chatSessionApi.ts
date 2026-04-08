import type { PersistedChatState } from "@/hooks/use-chat";
import { getReminderBackendBaseUrl } from "@/lib/collaboratorProgressApi";

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

  const fromSharedSetting = getReminderBackendBaseUrl();
  if (fromSharedSetting) return fromSharedSetting.replace(/\/$/, "");

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

export const hasSessionByEmail = async (email: string): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const baseUrl = getApiBaseUrl();

  if (!baseUrl || !isValidEmail(normalized)) {
    return false;
  }

  try {
    const response = await fetch(`${baseUrl}/api/chat-sessions/${encodeURIComponent(normalized)}`);
    if (!response.ok) return false;

    const snapshot = (await response.json()) as PersistedChatState;
    return sessionHasMeaningfulContent(snapshot);
  } catch {
    return false;
  }
};

export const fetchSessionByEmail = async (email: string): Promise<PersistedChatState | null> => {
  const normalized = normalizeEmail(email);
  const baseUrl = getApiBaseUrl();

  if (!baseUrl || !isValidEmail(normalized)) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/api/chat-sessions/${encodeURIComponent(normalized)}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const snapshot = (await response.json()) as PersistedChatState;
    return sessionHasMeaningfulContent(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
};

export const saveSessionByEmail = async (email: string, snapshot: PersistedChatState): Promise<void> => {
  const normalized = normalizeEmail(email);
  const baseUrl = getApiBaseUrl();

  if (!baseUrl || !isValidEmail(normalized)) {
    return;
  }

  await fetch(`${baseUrl}/api/chat-sessions/${encodeURIComponent(normalized)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...snapshot,
      employeeEmail: normalized,
    }),
  });
};