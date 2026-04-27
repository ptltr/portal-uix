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

const parseJsonIfString = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const sessionHasMeaningfulContent = (snapshot: PersistedChatState): boolean => {
  // Treat partial guided snapshots as resumable even if report/messages are sparse.
  const hasMessages = (snapshot.messages || []).length > 0;
  const hasReport = Boolean(snapshot.finalReport);
  const hasFlow = Boolean(snapshot.assessmentFlow && typeof snapshot.assessmentFlow === "object");
  const hasProfile = Boolean(String(snapshot.selectedProfile || "").trim());
  const hasConversationId = typeof snapshot.conversationId === "number";
  return hasMessages || hasReport || hasFlow || (hasProfile && hasConversationId);
};

const snapshotBelongsToEmail = (snapshot: PersistedChatState, requestedEmail: string): boolean => {
  const normalizedRequested = normalizeEmail(requestedEmail);
  const normalizedSnapshotEmail = normalizeEmail(String(snapshot.employeeEmail || ""));
  if (!normalizedRequested) return false;

  // Legacy snapshots may not include employeeEmail even when fetched by a specific email.
  // Accept those, but still reject explicit mismatches.
  if (!normalizedSnapshotEmail) return true;

  return normalizedSnapshotEmail === normalizedRequested;
};

const parseSessionSnapshot = (value: unknown): PersistedChatState | null => {
  const normalizedValue = parseJsonIfString(value);
  if (!normalizedValue || typeof normalizedValue !== "object") return null;

  const unwrap = (input: unknown): Record<string, unknown> | null => {
    const parsedInput = parseJsonIfString(input);
    if (!parsedInput || typeof parsedInput !== "object") return null;
    const obj = parsedInput as Record<string, unknown>;
    if (obj.snapshot && typeof obj.snapshot === "object") return obj.snapshot as Record<string, unknown>;
    if (obj.session && typeof obj.session === "object") return obj.session as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object") return unwrap(obj.data);
    if (obj.result && typeof obj.result === "object") return unwrap(obj.result);
    return obj;
  };

  const raw = unwrap(normalizedValue);
  if (!raw) return null;

  const rawMessages = parseJsonIfString(
    raw.messages
    ?? raw.rawConversation
    ?? raw.conversation
    ?? raw.chatHistory
    ?? raw.transcript
  );
  const messages = Array.isArray(rawMessages)
    ? rawMessages
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") return null;
          const msg = entry as Record<string, unknown>;
          const roleRaw = String(msg.role || "assistant").toLowerCase();
          const role = roleRaw === "user" || roleRaw === "assistant" || roleRaw === "system"
            ? roleRaw
            : "assistant";
          const content = String(msg.content || msg.message || msg.text || msg.body || "").trim();
          if (!content) return null;
          return {
            id: String(msg.id || `restored-${Date.now()}-${index}`),
            role,
            content,
          };
        })
        .filter((item): item is PersistedChatState["messages"][number] => Boolean(item))
    : [];
  const finalReport = typeof raw.finalReport === "string"
    ? raw.finalReport
    : (typeof raw.report === "string" ? raw.report : "");

  const rawAssessmentFlow = parseJsonIfString(raw.assessmentFlow);
  const hasAssessmentFlow = Boolean(
    rawAssessmentFlow
    && typeof rawAssessmentFlow === "object"
    && Array.isArray((rawAssessmentFlow as Record<string, unknown>).competencyOrder)
    && (rawAssessmentFlow as Record<string, unknown>).assessments
  );

  return {
    conversationId: typeof raw.conversationId === "number" ? raw.conversationId : null,
    messages: messages as PersistedChatState["messages"],
    isEvaluationComplete: Boolean(raw.isEvaluationComplete),
    employeeName: typeof raw.employeeName === "string" ? raw.employeeName : "",
    employeeEmail: typeof raw.employeeEmail === "string" ? raw.employeeEmail : "",
    trainerName: typeof raw.trainerName === "string" ? raw.trainerName : "",
    currentStep: typeof raw.currentStep === "number" ? raw.currentStep : 0,
    finalReport,
    followUpCount: typeof raw.followUpCount === "number" ? raw.followUpCount : 0,
    isInFollowUp: Boolean(raw.isInFollowUp),
    signals: (raw.signals && typeof raw.signals === "object")
      ? (raw.signals as PersistedChatState["signals"])
      : { strengths: {}, opportunities: {} },
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    selectedProfile: typeof raw.selectedProfile === "string"
      ? raw.selectedProfile
      : (typeof raw.profile === "string" ? raw.profile : ""),
    assessmentFlow: hasAssessmentFlow
      ? (rawAssessmentFlow as PersistedChatState["assessmentFlow"])
      : null,
  };
};

const LEGACY_REMINDER_API_BASE_URL_KEY = "uix-reminder-api-base-url";

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

const getSessionRank = (snapshot: PersistedChatState | null) => {
  if (!snapshot) {
    return { userMessagesCount: -1, hasReport: 0, updatedAt: 0 };
  }

  const userMessagesCount = Array.isArray(snapshot.messages)
    ? snapshot.messages.filter((msg) => msg?.role === "user" && String(msg.content || "").trim().length > 0).length
    : 0;

  return {
    userMessagesCount,
    hasReport: snapshot.finalReport ? 1 : 0,
    updatedAt: typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : 0,
  };
};

const pickBetterSession = (
  first: PersistedChatState | null,
  second: PersistedChatState | null,
): PersistedChatState | null => {
  const a = getSessionRank(first);
  const b = getSessionRank(second);

  if (a.userMessagesCount !== b.userMessagesCount) {
    return a.userMessagesCount > b.userMessagesCount ? first : second;
  }

  if (a.hasReport !== b.hasReport) {
    return a.hasReport > b.hasReport ? first : second;
  }

  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt >= b.updatedAt ? first : second;
  }

  return first || second;
};

const fetchSessionSnapshotFromAppsScript = async (baseUrl: string, email: string): Promise<PersistedChatState | null> => {
  try {
    const response = await fetch(buildAppsScriptUrl(baseUrl, "getChatSession", { email }));
    if (!response.ok) return null;
    const body = await response.json() as Record<string, unknown>;
    // Apps Script can return 200 with { ok:false, ... } for not-found/error cases.
    if (body && typeof body === "object" && body.ok === false) return null;
    const parsed = parseSessionSnapshot(body);
    if (!parsed || !sessionHasMeaningfulContent(parsed)) return null;
    if (!snapshotBelongsToEmail(parsed, email)) return null;
    return {
      ...parsed,
      employeeEmail: normalizeEmail(parsed.employeeEmail || email),
    };
  } catch {
    return null;
  }
};

const fetchSessionSnapshotFromRest = async (baseUrl: string, email: string): Promise<PersistedChatState | null> => {
  try {
    const response = await fetch(`${baseUrl}/api/chat-sessions/${encodeURIComponent(email)}`);
    if (response.status === 404 || !response.ok) return null;
    const parsed = parseSessionSnapshot(await response.json());
    if (!parsed || !sessionHasMeaningfulContent(parsed)) return null;
    if (!snapshotBelongsToEmail(parsed, email)) return null;
    return {
      ...parsed,
      employeeEmail: normalizeEmail(parsed.employeeEmail || email),
    };
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

  for (const baseUrl of baseUrls) {
    const snapshot = await fetchSessionSnapshot(baseUrl, normalized);
    best = pickBetterSession(best, snapshot);
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
    await fetch(`${baseUrl}/api/chat-sessions/${encodeURIComponent(normalized)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  };

  const saveWithAppsScript = async (): Promise<void> => {
    await callAppsScriptPost(baseUrl, "upsertChatSession", {
      email: normalized,
      snapshot: payload,
    });
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