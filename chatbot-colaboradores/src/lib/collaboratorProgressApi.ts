export type DeliverableType = "mini-case" | "learning-summary" | "tool-explainer" | "custom";

export interface DeliverableTemplateResponse {
  prompt: string;
  response: string;
}

export interface DeliverablePayload {
  collaboratorEmail: string;
  collaboratorName?: string;
  assessmentId?: string;
  title: string;
  summary: string;
  deliverableType?: DeliverableType;
  templateResponses?: DeliverableTemplateResponse[];
  evidenceUrls?: string[];
  completedResources?: string[];
}

export interface DeliverableRecord extends DeliverablePayload {
  id: string;
  submittedAt: string;
}

export interface CollaboratorProgress {
  collaboratorEmail: string;
  collaboratorName?: string;
  profile?: string;
  latestAssessmentId?: string;
  assignedResources: string[];
  completedResourcesCount: number;
  totalResourcesCount: number;
  completionPercentage: number;
  status: "on-track" | "at-risk" | "completed";
  deliverables: DeliverableRecord[];
  updatedAt: string;
}

export interface SyncCollaboratorAssessmentPayload {
  collaboratorEmail: string;
  collaboratorName?: string;
  profile?: string;
  assessmentId?: string;
  assignedResources: string[];
}

export interface SendReminderPayload {
  collaboratorEmail: string;
  collaboratorName?: string;
  pendingCoursesCount: number;
  completedResourcesCount: number;
  totalResourcesCount: number;
}

const LOCAL_PROGRESS_KEY = "uix-collaborator-progress-v1";
const REMINDER_API_BASE_URL_KEY = "uix-reminder-api-base-url";
const DEFAULT_AUTOMATIC_BACKEND_BASE_URL = "https://script.google.com/macros/s/AKfycbzBdx5IHMaqNjYcN5O6z9k1oH9sbOffc0Ik353LF613zmZ0bROUDQSJQUTp2JvZ6RHJoQ/exec";

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

  const response = await fetch(baseUrl, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(`Apps Script request failed: ${response.status}`);
  }

  const data = (await response.json()) as { ok?: boolean; message?: string } & T;
  if (data && typeof data === "object" && data.ok === false) {
    throw new Error(data.message || "Apps Script returned an error.");
  }

  return data as T;
};

const callAppsScriptGet = async <T>(baseUrl: string, action: string, params?: Record<string, string>): Promise<T> => {
  const response = await fetch(buildAppsScriptUrl(baseUrl, action, params));

  if (!response.ok) {
    throw new Error(`Apps Script request failed: ${response.status}`);
  }

  const data = (await response.json()) as { ok?: boolean; message?: string } & T;
  if (data && typeof data === "object" && data.ok === false) {
    throw new Error(data.message || "Apps Script returned an error.");
  }

  return data as T;
};

const buildReminderResumeUrl = (email: string, name: string): string => {
  if (typeof window === "undefined") {
    return "https://ptltr.github.io/portal-uix/";
  }

  const url = new URL(import.meta.env.BASE_URL || "/", window.location.origin);
  url.searchParams.set("resume", "1");
  url.searchParams.set("email", email);
  url.searchParams.set("name", name);
  return url.toString();
};

const sendReminderViaWebhookPayload = async (
  baseUrl: string,
  payload: SendReminderPayload,
): Promise<{ sent: boolean; id?: string }> => {
  const collaboratorEmail = normalizeEmail(payload.collaboratorEmail);
  const collaboratorName = (payload.collaboratorName || collaboratorEmail).trim() || collaboratorEmail;
  const pendingCoursesCount = Math.max(Number(payload.pendingCoursesCount || 0), 0);
  const completedResourcesCount = Math.max(Number(payload.completedResourcesCount || 0), 0);
  const totalResourcesCount = Math.max(Number(payload.totalResourcesCount || 0), 1);
  const resumeUrl = buildReminderResumeUrl(collaboratorEmail, collaboratorName);

  const subject = "Recordatorio de seguimiento - Cursos pendientes";
  const text = [
    `Hola ${collaboratorName},`,
    "",
    `Te compartimos un recordatorio: aun tienes ${pendingCoursesCount} curso(s) pendiente(s) por completar.`,
    `Tu avance actual es ${completedResourcesCount}/${totalResourcesCount}.`,
    "",
    `Continua aqui: ${resumeUrl}`,
    "",
    "Gracias,",
    "Capital Humano",
  ].join("\n");

  const html = [
    `<p>Hola ${collaboratorName},</p>`,
    `<p>Te compartimos un recordatorio: aun tienes <strong>${pendingCoursesCount} curso(s)</strong> pendiente(s) por completar.</p>`,
    `<p>Tu avance actual es <strong>${completedResourcesCount}/${totalResourcesCount}</strong>.</p>`,
    `<p><a href=\"${resumeUrl}\">Continuar en Asistente UiX</a></p>`,
    "<p>Gracias,<br/>Capital Humano</p>",
  ].join("");

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      // Apps Script webhook rejects preflight OPTIONS; use a simple CORS request.
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify({
      collaboratorEmail,
      collaboratorName,
      pendingCoursesCount,
      completedResourcesCount,
      totalResourcesCount,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Webhook request failed: ${response.status}`);
  }

  const result = (await response.json()) as { ok?: boolean; id?: string; message?: string; sent?: boolean };
  if (result.ok === false) {
    throw new Error(result.message || "Webhook reminder was rejected.");
  }

  return {
    sent: result.sent ?? result.ok ?? true,
    id: result.id,
  };
};

const shouldIgnoreLocalApiOnPublicHost = (url: string): boolean => {
  if (typeof window === "undefined") return false;

  const isLocalApi = /127\.0\.0\.1|localhost/.test(url);
  const isLocalHost = /127\.0\.0\.1|localhost/.test(window.location.hostname);
  return isLocalApi && !isLocalHost;
};

const getApiBaseUrl = (): string => {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL;
  if (!fromEnv) return DEFAULT_AUTOMATIC_BACKEND_BASE_URL;

  const normalized = fromEnv.replace(/\/$/, "");

  if (shouldIgnoreLocalApiOnPublicHost(normalized)) return DEFAULT_AUTOMATIC_BACKEND_BASE_URL;

  return normalized;
};

const getReminderApiBaseUrl = (): string => {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_REMINDER_API_BASE_URL;
  if (fromEnv) {
    const normalized = fromEnv.replace(/\/$/, "");
    if (shouldIgnoreLocalApiOnPublicHost(normalized)) return "";
    return normalized;
  }

  try {
    const fromStorage = localStorage.getItem(REMINDER_API_BASE_URL_KEY) || "";
    if (fromStorage) {
      const normalized = fromStorage.replace(/\/$/, "");
      if (shouldIgnoreLocalApiOnPublicHost(normalized)) return "";
      return normalized;
    }
  } catch {
    // Ignore localStorage access errors in restricted environments.
  }

  return DEFAULT_AUTOMATIC_BACKEND_BASE_URL;
};

export const isReminderBackendConfigured = (): boolean => {
  return Boolean(getReminderApiBaseUrl() || getApiBaseUrl());
};

export const getReminderBackendBaseUrl = (): string => {
  return getReminderApiBaseUrl() || getApiBaseUrl();
};

export const setReminderBackendBaseUrl = (value: string): void => {
  const normalized = value.trim().replace(/\/$/, "");
  if (!normalized) return;

  try {
    localStorage.setItem(REMINDER_API_BASE_URL_KEY, normalized);
  } catch {
    // Ignore localStorage access errors in restricted environments.
  }
};

const getLocalProgressMap = (): Record<string, CollaboratorProgress> => {
  try {
    const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CollaboratorProgress>;
  } catch {
    return {};
  }
};

const saveLocalProgressMap = (map: Record<string, CollaboratorProgress>) => {
  try {
    localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // Ignore localStorage failures in restricted environments.
  }
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const buildProgressStatus = (percentage: number): CollaboratorProgress["status"] => {
  if (percentage >= 100) return "completed";
  if (percentage > 0) return "on-track";
  return "at-risk";
};

const createEmptyProgress = (email: string): CollaboratorProgress => ({
  collaboratorEmail: email,
  collaboratorName: "",
  profile: "",
  latestAssessmentId: "",
  assignedResources: [],
  completedResourcesCount: 0,
  totalResourcesCount: 5,
  completionPercentage: 0,
  status: "at-risk",
  deliverables: [],
  updatedAt: new Date().toISOString(),
});

const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeResourceList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const normalizeDeliverables = (value: unknown): DeliverableRecord[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<DeliverableRecord>;
      const collaboratorEmail = normalizeEmail(typeof record.collaboratorEmail === "string" ? record.collaboratorEmail : "");
      const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `legacy-${Date.now()}-${index}`;
      const submittedAt = typeof record.submittedAt === "string" && record.submittedAt.trim()
        ? record.submittedAt
        : new Date().toISOString();

      return {
        collaboratorEmail,
        collaboratorName: typeof record.collaboratorName === "string" ? record.collaboratorName : "",
        assessmentId: typeof record.assessmentId === "string" ? record.assessmentId : "",
        title: typeof record.title === "string" ? record.title : "",
        summary: typeof record.summary === "string" ? record.summary : "",
        deliverableType: (record.deliverableType as DeliverableType) || "custom",
        templateResponses: Array.isArray(record.templateResponses) ? record.templateResponses : [],
        evidenceUrls: Array.isArray(record.evidenceUrls) ? record.evidenceUrls : [],
        completedResources: Array.isArray(record.completedResources) ? record.completedResources : [],
        id,
        submittedAt,
      } as DeliverableRecord;
    })
    .filter((record): record is DeliverableRecord => Boolean(record));
};

const normalizeProgressRecord = (value: unknown): CollaboratorProgress | null => {
  if (!value || typeof value !== "object") return null;

  const raw = value as Partial<CollaboratorProgress>;
  const collaboratorEmail = normalizeEmail(typeof raw.collaboratorEmail === "string" ? raw.collaboratorEmail : "");
  if (!collaboratorEmail) return null;

  const assignedResources = normalizeResourceList(raw.assignedResources);
  const deliverables = normalizeDeliverables(raw.deliverables);
  const totalResourcesCount = Math.max(
    toFiniteNumber(raw.totalResourcesCount, assignedResources.length || 5),
    assignedResources.length || 1,
    1,
  );
  const completedResourcesCount = Math.min(
    Math.max(toFiniteNumber(raw.completedResourcesCount, 0), 0),
    totalResourcesCount,
  );
  const completionPercentage = Math.min(
    100,
    Math.max(
      toFiniteNumber(
        raw.completionPercentage,
        Math.round((completedResourcesCount / totalResourcesCount) * 100),
      ),
      0,
    ),
  );
  const updatedAt = typeof raw.updatedAt === "string" && raw.updatedAt.trim()
    ? raw.updatedAt
    : new Date().toISOString();

  return {
    collaboratorEmail,
    collaboratorName: typeof raw.collaboratorName === "string" ? raw.collaboratorName : "",
    profile: typeof raw.profile === "string" ? raw.profile : "",
    latestAssessmentId: typeof raw.latestAssessmentId === "string" ? raw.latestAssessmentId : "",
    assignedResources,
    completedResourcesCount,
    totalResourcesCount,
    completionPercentage,
    status: buildProgressStatus(completionPercentage),
    deliverables,
    updatedAt,
  };
};

const buildProgressMap = (records: CollaboratorProgress[]): Record<string, CollaboratorProgress> => {
  const map: Record<string, CollaboratorProgress> = {};
  for (const record of records) {
    map[record.collaboratorEmail] = record;
  }
  return map;
};

const mergeProgressLists = (
  remoteRecords: CollaboratorProgress[],
  localRecords: CollaboratorProgress[],
): CollaboratorProgress[] => {
  const merged = buildProgressMap(localRecords);

  for (const remote of remoteRecords) {
    const current = merged[remote.collaboratorEmail];
    if (!current) {
      merged[remote.collaboratorEmail] = remote;
      continue;
    }

    const remoteIsNewer = String(remote.updatedAt || "").localeCompare(String(current.updatedAt || "")) >= 0;
    const base = remoteIsNewer ? remote : current;
    const fallback = remoteIsNewer ? current : remote;

    merged[remote.collaboratorEmail] = {
      ...base,
      collaboratorName: base.collaboratorName || fallback.collaboratorName,
      profile: base.profile || fallback.profile,
      latestAssessmentId: base.latestAssessmentId || fallback.latestAssessmentId,
      assignedResources: base.assignedResources.length ? base.assignedResources : fallback.assignedResources,
      deliverables: base.deliverables.length ? base.deliverables : fallback.deliverables,
    };
  }

  return Object.values(merged).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

const upsertLocalAssessment = (payload: SyncCollaboratorAssessmentPayload): CollaboratorProgress => {
  const nowIso = new Date().toISOString();
  const email = normalizeEmail(payload.collaboratorEmail);
  const map = getLocalProgressMap();
  const existing = map[email] || createEmptyProgress(email);
  const totalResourcesCount = Math.max(payload.assignedResources.length || existing.totalResourcesCount, 1);
  const completedResourcesCount = Math.min(existing.completedResourcesCount, totalResourcesCount);
  const completionPercentage = Math.min(100, Math.round((completedResourcesCount / totalResourcesCount) * 100));

  map[email] = {
    ...existing,
    collaboratorEmail: email,
    collaboratorName: payload.collaboratorName || existing.collaboratorName,
    profile: payload.profile || existing.profile,
    latestAssessmentId: payload.assessmentId || existing.latestAssessmentId,
    assignedResources: payload.assignedResources.length ? payload.assignedResources : existing.assignedResources,
    totalResourcesCount,
    completedResourcesCount,
    completionPercentage,
    status: buildProgressStatus(completionPercentage),
    updatedAt: nowIso,
  };

  saveLocalProgressMap(map);
  return map[email];
};

const upsertLocalDeliverable = (payload: DeliverablePayload): DeliverableRecord => {
  const nowIso = new Date().toISOString();
  const email = normalizeEmail(payload.collaboratorEmail);
  const map = getLocalProgressMap();

  const existing = map[email] || {
    ...createEmptyProgress(email),
    updatedAt: nowIso,
  };

  const completedResourcesCount = payload.completedResources?.length ?? existing.completedResourcesCount;
  const totalResourcesCount = Math.max(existing.totalResourcesCount, 1);
  const completionPercentage = Math.min(100, Math.round((completedResourcesCount / totalResourcesCount) * 100));

  const record: DeliverableRecord = {
    ...payload,
    collaboratorEmail: email,
    id: `deliv-${Date.now()}`,
    submittedAt: nowIso,
  };

  map[email] = {
    ...existing,
    collaboratorEmail: email,
    collaboratorName: payload.collaboratorName || existing.collaboratorName,
    latestAssessmentId: payload.assessmentId || existing.latestAssessmentId,
    completedResourcesCount,
    totalResourcesCount,
    completionPercentage,
    status: buildProgressStatus(completionPercentage),
    deliverables: [...existing.deliverables, record],
    updatedAt: nowIso,
  };

  saveLocalProgressMap(map);
  return record;
};

export const uploadDeliverable = async (payload: DeliverablePayload): Promise<DeliverableRecord> => {
  const baseUrl = getApiBaseUrl();

  if (baseUrl) {
    if (isAppsScriptEndpoint(baseUrl)) {
      return callAppsScriptPost<DeliverableRecord>(baseUrl, "uploadDeliverable", payload);
    }

    const response = await fetch(`${baseUrl}/api/collaborators/progress/deliverables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload deliverable: ${response.status}`);
    }

    return (await response.json()) as DeliverableRecord;
  }

  // Fallback for environments without backend.
  return upsertLocalDeliverable(payload);
};

export const syncCollaboratorAssessment = async (payload: SyncCollaboratorAssessmentPayload): Promise<CollaboratorProgress> => {
  const baseUrl = getApiBaseUrl();

  if (baseUrl) {
    if (isAppsScriptEndpoint(baseUrl)) {
      return callAppsScriptPost<CollaboratorProgress>(baseUrl, "syncCollaboratorAssessment", payload);
    }

    const response = await fetch(`${baseUrl}/api/collaborators/progress/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync collaborator assessment: ${response.status}`);
    }

    return (await response.json()) as CollaboratorProgress;
  }

  return upsertLocalAssessment(payload);
};

export const getCollaboratorProgress = async (collaboratorEmail: string): Promise<CollaboratorProgress> => {
  const email = normalizeEmail(collaboratorEmail);
  const baseUrl = getApiBaseUrl();

  if (baseUrl) {
    if (isAppsScriptEndpoint(baseUrl)) {
      const remote = await callAppsScriptGet<CollaboratorProgress>(baseUrl, "getCollaboratorProgress", { email });
      return normalizeProgressRecord(remote) || createEmptyProgress(email);
    }

    const response = await fetch(`${baseUrl}/api/collaborators/progress/${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch collaborator progress: ${response.status}`);
    }

    const remote = (await response.json()) as CollaboratorProgress;
    return normalizeProgressRecord(remote) || createEmptyProgress(email);
  }

  // Fallback for environments without backend.
  const map = getLocalProgressMap();
  return map[email] || createEmptyProgress(email);
};

export const listCollaboratorsProgress = async (): Promise<CollaboratorProgress[]> => {
  const baseUrl = getApiBaseUrl();
  const localMap = getLocalProgressMap();
  const localList = Object.values(localMap)
    .map((record) => normalizeProgressRecord(record))
    .filter((record): record is CollaboratorProgress => Boolean(record));

  if (baseUrl) {
    if (isAppsScriptEndpoint(baseUrl)) {
      const remote = await callAppsScriptGet<CollaboratorProgress[]>(baseUrl, "listCollaboratorsProgress");
      const remoteList = (Array.isArray(remote) ? remote : [])
        .map((record) => normalizeProgressRecord(record))
        .filter((record): record is CollaboratorProgress => Boolean(record));
      return mergeProgressLists(remoteList, localList);
    }

    const response = await fetch(`${baseUrl}/api/collaborators/progress`);
    if (!response.ok) {
      throw new Error(`Failed to fetch collaborators progress list: ${response.status}`);
    }

    const remote = (await response.json()) as CollaboratorProgress[];
    const remoteList = (Array.isArray(remote) ? remote : [])
      .map((record) => normalizeProgressRecord(record))
      .filter((record): record is CollaboratorProgress => Boolean(record));
    return mergeProgressLists(remoteList, localList);
  }

  return localList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const sendProgressReminder = async (payload: SendReminderPayload): Promise<{ sent: boolean; id?: string }> => {
  const baseUrl = getReminderApiBaseUrl() || getApiBaseUrl();

  if (!baseUrl) {
    throw new Error("Automatic reminder requires VITE_API_BASE_URL configuration.");
  }

  if (isAppsScriptEndpoint(baseUrl)) {
    try {
      const result = await callAppsScriptPost<{ sent: boolean; id?: string; message?: string }>(baseUrl, "sendProgressReminder", payload);
      if (!result.sent) {
        throw new Error(result.message || "Apps Script did not confirm reminder delivery.");
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const shouldTryWebhookPayload = message.includes("unauthorized") || message.includes("invalid_json") || message.includes("missing action");
      if (!shouldTryWebhookPayload) {
        throw error;
      }

      const result = await sendReminderViaWebhookPayload(baseUrl, payload);
      if (!result.sent) {
        throw new Error("Webhook reminder did not confirm delivery.");
      }
      return result;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/collaborators/progress/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `No fue posible conectar con el backend de recordatorios (${baseUrl}). ` +
      "Actualiza la URL en Configuracion de recordatorios automáticos.",
    );
  }

  if (!response.ok) {
    let details = "";
    try {
      const errorBody = (await response.json()) as { message?: string };
      details = errorBody?.message ? ` - ${errorBody.message}` : "";
    } catch {
      // Ignore JSON parse failures and fall back to status code message.
    }
    throw new Error(`Failed to send reminder email: ${response.status}${details}`);
  }

  return (await response.json()) as { sent: boolean; id?: string };
};
