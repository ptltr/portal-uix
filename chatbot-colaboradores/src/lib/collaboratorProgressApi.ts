export type DeliverableType = "mini-case" | "learning-summary" | "tool-explainer" | "custom";

export interface DeliverableTemplateResponse {
  prompt: string;
  response: string;
}

export interface DeliverablePayload {
  collaboratorEmail: string;
  collaboratorName?: string;
  trainerName?: string;
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
  trainerName?: string;
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
  trainerName?: string;
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
const DEFAULT_AUTOMATIC_BACKEND_BASE_URL = "https://script.google.com/macros/s/AKfycbynS_eP4l7Oq1LOYyE5tnBaPoEzQsUobFU4MjWAGtIZdOv66fyH7zFsGvaIdbujv2T9aA/exec";
const LEGACY_AUTOMATIC_BACKEND_BASE_URL = "https://script.google.com/macros/s/AKfycbzlMWjNRT1EvDCjW9lQkV4j1EwU90Z85X6ulpQrRR8eAxnc2CD0z6J7m71ezqscpxrU/exec";

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
type AppsScriptRuntimeCacheEntry = {
  url: string;
  expiresAt: number;
};

const APPS_SCRIPT_RUNTIME_URL_TTL_MS = 60_000;
const appsScriptRuntimeUrlCache = new Map<string, AppsScriptRuntimeCacheEntry>();

const resolveAppsScriptRuntimeUrl = async (baseUrl: string, forceRefresh = false): Promise<string> => {
  const cached = appsScriptRuntimeUrlCache.get(baseUrl);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.url;

  const probeUrl = new URL(baseUrl);
  probeUrl.searchParams.set("action", "health");

  const probeResponse = await fetch(probeUrl.toString());
  if (!probeResponse.ok) {
    throw new Error(`Apps Script probe failed: ${probeResponse.status}`);
  }

  const resolvedUrl = new URL(probeResponse.url || baseUrl);
  resolvedUrl.searchParams.delete("action");
  resolvedUrl.searchParams.delete("payload");
  resolvedUrl.searchParams.delete("email");
  const resolved = resolvedUrl.toString();
  appsScriptRuntimeUrlCache.set(baseUrl, {
    url: resolved,
    expiresAt: Date.now() + APPS_SCRIPT_RUNTIME_URL_TTL_MS,
  });
  return resolved;
};

const callAppsScriptPost = async <T>(baseUrl: string, action: string, payload: unknown): Promise<T> => {
  const body = new URLSearchParams();
  body.set("action", action);
  body.set("payload", JSON.stringify(payload));

  const postToRuntime = async (forceRefresh = false): Promise<Response> => {
    const runtimeUrl = await resolveAppsScriptRuntimeUrl(baseUrl, forceRefresh);
    return fetch(runtimeUrl, {
      method: "POST",
      body,
    });
  };

  let response = await postToRuntime(false);
  const contentType = response.headers.get("content-type") || "";
  const hasJsonResponse = contentType.includes("application/json");
  if (!response.ok || !hasJsonResponse) {
    response = await postToRuntime(true);
  }

  if (!response.ok) {
    throw new Error(`Apps Script request failed: ${response.status}`);
  }

  const finalContentType = response.headers.get("content-type") || "";
  if (!finalContentType.includes("application/json")) {
    throw new Error("Apps Script request failed: non-JSON response");
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

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const completionPercentage = Math.min(
    100,
    Math.max(0, Math.round((completedResourcesCount / Math.max(totalResourcesCount, 1)) * 100)),
  );
  const progressWidth = `${completionPercentage}%`;
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

  const html = `
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </head>
      <body style="margin:0;padding:0;background-color:#0d0220 !important;">
        <div style="background-color:#0d0220 !important;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0d0220" style="max-width:620px;margin:0 auto;border-collapse:collapse;background-color:#0d0220 !important;">
            <tr>
              <td style="padding:0;">
                <div style="background-color:#7b3fd9;border-radius:16px 16px 0 0;padding:18px 24px;color:#ffffff;border-bottom:4px solid #4ade80;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="vertical-align:middle;width:48px;">
                        <table role="presentation" width="44" height="44" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="border-collapse:collapse;background-color:#ffffff;border-radius:12px;border:2px solid #2f0f66;">
                          <tr>
                            <td align="center" valign="middle" style="font-size:14px;font-weight:800;color:#6a38bf;letter-spacing:.01em;">
                              Ui<span style="color:#4ade80;">X</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="padding-left:12px;vertical-align:middle;">
                        <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.95;color:#f3edff;">Asistente UiX</p>
                        <h1 style="margin:6px 0 0 0;font-size:22px;line-height:1.25;">Recordatorio de avance</h1>
                      </td>
                    </tr>
                  </table>
                </div>
                <div style="background-color:#ffffff !important;border:1px solid #e9dcff;border-top:none;border-radius:0 0 16px 16px;padding:24px;color:#0f172a !important;">
                  <p style="margin:0 0 12px 0;font-size:16px;color:#0f172a;">Hola ${escapeHtml(collaboratorName)},</p>
                  <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">
                    Te compartimos un recordatorio de tu plan de desarrollo en UiX. Aun tienes
                    <strong>${pendingCoursesCount} curso(s) pendiente(s)</strong> por completar.
                  </p>

                  <div style="background-color:#f9f6ff;border:1px solid #e8defa;border-radius:12px;padding:14px 16px;margin:0 0 16px 0;">
                    <p style="margin:0 0 8px 0;font-size:13px;color:#475569;">Progreso actual</p>
                    <p style="margin:0 0 10px 0;font-size:18px;font-weight:700;color:#0f172a;">${completedResourcesCount}/${totalResourcesCount} recursos (${completionPercentage}%)</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#e4dff0" style="border-collapse:collapse;background-color:#e4dff0;border-radius:999px;overflow:hidden;">
                      <tr>
                        <td style="padding:0;">
                          <div style="height:10px;line-height:10px;font-size:0;background-color:#7b3fd9;width:${progressWidth};">&nbsp;</div>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#334155;">
                    En caso de que tus pendientes incluyan talleres, acércate a Capital Humano para coordinarlos.
                  </p>

                  <a href="${resumeUrl}" style="display:inline-block;background:#7b3fd9;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:10px;font-size:14px;border:1px solid #5f2fb2;">
                    Continuar en Asistente UiX
                  </a>

                  <p style="margin:18px 0 0 0;font-size:12px;line-height:1.6;color:#64748b;">
                    Este correo fue enviado por Capital Humano para dar seguimiento a tu ruta de aprendizaje.
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </div>
      </body>
    </html>
  `;

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

const getProgressWriteBaseUrls = (): string[] => {
  const urls = [getApiBaseUrl(), LEGACY_AUTOMATIC_BACKEND_BASE_URL]
    .map((url) => String(url || "").replace(/\/$/, ""))
    .filter(Boolean);

  return Array.from(new Set(urls));
};

const getProgressLookupBaseUrls = (): string[] => {
  const urls = [getApiBaseUrl(), LEGACY_AUTOMATIC_BACKEND_BASE_URL]
    .map((url) => String(url || "").replace(/\/$/, ""))
    .filter(Boolean);

  try {
    const fromStorage = localStorage.getItem(REMINDER_API_BASE_URL_KEY) || "";
    if (fromStorage) {
      urls.push(fromStorage.replace(/\/$/, ""));
    }
  } catch {
    // Ignore localStorage access errors.
  }

  return Array.from(new Set(urls));
};

const hasMeaningfulProgressData = (record: CollaboratorProgress | null | undefined): boolean => {
  if (!record) return false;
  return Boolean(
    record.assignedResources.length
    || record.deliverables.length
    || record.completedResourcesCount > 0
    || String(record.collaboratorName || "").trim()
    || String(record.trainerName || "").trim()
    || String(record.profile || "").trim(),
  );
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
  trainerName: "",
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

const normalizeResourceKey = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const normalizeDeliverables = (
  value: unknown,
  fallbackSubmittedAt?: string,
  expectedEmail?: string,
): DeliverableRecord[] => {
  if (!Array.isArray(value)) return [];

  const normalizedExpectedEmail = normalizeEmail(String(expectedEmail || ""));

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<DeliverableRecord>;
      const collaboratorEmail = normalizeEmail(
        typeof record.collaboratorEmail === "string" ? record.collaboratorEmail : "",
      ) || normalizedExpectedEmail;
      if (normalizedExpectedEmail && collaboratorEmail && collaboratorEmail !== normalizedExpectedEmail) {
        return null;
      }
      const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `legacy-${Date.now()}-${index}`;
      const submittedAt = typeof record.submittedAt === "string" && record.submittedAt.trim()
        ? record.submittedAt
        : (fallbackSubmittedAt || "");

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

const countUniqueCompletedResources = (deliverables: DeliverableRecord[]): number => {
  const seen = new Set<string>();
  for (const deliverable of deliverables) {
    for (const resource of deliverable.completedResources || []) {
      const key = normalizeResourceKey(String(resource || ""));
      if (key) seen.add(key);
    }
  }
  return seen.size;
};

const normalizeProgressRecord = (value: unknown): CollaboratorProgress | null => {
  if (!value || typeof value !== "object") return null;

  const unwrap = (input: unknown): Record<string, unknown> | null => {
    if (!input || typeof input !== "object") return null;
    const obj = input as Record<string, unknown>;
    if (obj.progress && typeof obj.progress === "object") return unwrap(obj.progress);
    if (obj.data && typeof obj.data === "object") return unwrap(obj.data);
    if (obj.result && typeof obj.result === "object") return unwrap(obj.result);
    return obj;
  };

  const unwrapped = unwrap(value);
  if (!unwrapped) return null;

  const raw = unwrapped as Partial<CollaboratorProgress> & Record<string, unknown>;
  const emailCandidate =
    (typeof raw.collaboratorEmail === "string" ? raw.collaboratorEmail : "")
    || (typeof raw.email === "string" ? raw.email : "")
    || (typeof raw.collaborator_email === "string" ? raw.collaborator_email : "");
  const collaboratorEmail = normalizeEmail(emailCandidate);
  if (!collaboratorEmail) return null;

  const assignedResources = normalizeResourceList(
    raw.assignedResources
    ?? raw.resources
    ?? raw.recommendedResources
    ?? raw.recommended_resources,
  );
  const fallbackSubmittedAt = typeof raw.updatedAt === "string" && raw.updatedAt.trim()
    ? raw.updatedAt
    : "";
  const deliverables = normalizeDeliverables(
    raw.deliverables ?? raw.submissions,
    fallbackSubmittedAt,
    collaboratorEmail,
  );
  const totalResourcesCount = Math.max(
    toFiniteNumber(raw.totalResourcesCount, assignedResources.length || 5),
    assignedResources.length || 1,
    1,
  );
  const completedFromDeliverables = countUniqueCompletedResources(deliverables);
  const completedResourcesCount = Math.min(
    Math.max(toFiniteNumber(raw.completedResourcesCount, 0), completedFromDeliverables, 0),
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
    trainerName: typeof raw.trainerName === "string" ? raw.trainerName : "",
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

const progressBelongsToEmail = (record: CollaboratorProgress | null, requestedEmail: string): boolean => {
  if (!record) return false;
  return normalizeEmail(record.collaboratorEmail || "") === normalizeEmail(requestedEmail);
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
      trainerName: base.trainerName || fallback.trainerName,
      profile: base.profile || fallback.profile,
      latestAssessmentId: base.latestAssessmentId || fallback.latestAssessmentId,
      assignedResources: base.assignedResources.length ? base.assignedResources : fallback.assignedResources,
      deliverables: base.deliverables.length ? base.deliverables : fallback.deliverables,
    };
  }

  return Object.values(merged).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

const mergeProgressRecordPair = (
  primary: CollaboratorProgress,
  secondary: CollaboratorProgress,
): CollaboratorProgress => {
  const deliverablesById = new Map<string, DeliverableRecord>();
  for (const item of [...secondary.deliverables, ...primary.deliverables]) {
    if (item?.id) {
      deliverablesById.set(item.id, item);
    }
  }

  const mergedDeliverables = Array.from(deliverablesById.values()).sort((a, b) => {
    return String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
  });

  const totalResourcesCount = Math.max(primary.totalResourcesCount, secondary.totalResourcesCount, 1);
  const completedFromDeliverables = countUniqueCompletedResources(mergedDeliverables);
  const completedResourcesCount = Math.min(
    totalResourcesCount,
    Math.max(primary.completedResourcesCount, secondary.completedResourcesCount, completedFromDeliverables),
  );
  const completionPercentage = Math.min(
    100,
    Math.max(
      primary.completionPercentage,
      secondary.completionPercentage,
      Math.round((completedResourcesCount / totalResourcesCount) * 100),
    ),
  );

  return {
    ...primary,
    collaboratorName: primary.collaboratorName || secondary.collaboratorName,
    trainerName: primary.trainerName || secondary.trainerName,
    profile: primary.profile || secondary.profile,
    latestAssessmentId: primary.latestAssessmentId || secondary.latestAssessmentId,
    assignedResources: primary.assignedResources.length ? primary.assignedResources : secondary.assignedResources,
    totalResourcesCount,
    completedResourcesCount,
    completionPercentage,
    status: buildProgressStatus(completionPercentage),
    deliverables: mergedDeliverables,
    updatedAt: String(primary.updatedAt || "").localeCompare(String(secondary.updatedAt || "")) >= 0
      ? primary.updatedAt
      : secondary.updatedAt,
  };
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
    trainerName: payload.trainerName || existing.trainerName,
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

  const record: DeliverableRecord = {
    ...payload,
    collaboratorEmail: email,
    id: `deliv-${Date.now()}`,
    submittedAt: nowIso,
  };

  const nextDeliverables = [...existing.deliverables, record];
  const totalResourcesCount = Math.max(existing.totalResourcesCount, 1);
  const completedResourcesCount = Math.min(totalResourcesCount, countUniqueCompletedResources(nextDeliverables));
  const completionPercentage = Math.min(100, Math.round((completedResourcesCount / totalResourcesCount) * 100));

  map[email] = {
    ...existing,
    collaboratorEmail: email,
    collaboratorName: payload.collaboratorName || existing.collaboratorName,
    trainerName: payload.trainerName || existing.trainerName,
    latestAssessmentId: payload.assessmentId || existing.latestAssessmentId,
    completedResourcesCount,
    totalResourcesCount,
    completionPercentage,
    status: buildProgressStatus(completionPercentage),
    deliverables: nextDeliverables,
    updatedAt: nowIso,
  };

  saveLocalProgressMap(map);
  return record;
};

export const uploadDeliverable = async (payload: DeliverablePayload): Promise<DeliverableRecord> => {
  const baseUrls = getProgressWriteBaseUrls();

  if (baseUrls.length) {
    for (const baseUrl of baseUrls) {
      try {
        if (isAppsScriptEndpoint(baseUrl)) {
          return await callAppsScriptPost<DeliverableRecord>(baseUrl, "uploadDeliverable", payload);
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
      } catch {
        // Try next configured backend.
      }
    }

    // Keep progress tracking usable even if remote backend is unreachable.
    return upsertLocalDeliverable(payload);
  }

  // Fallback for environments without backend.
  return upsertLocalDeliverable(payload);
};

export const syncCollaboratorAssessment = async (payload: SyncCollaboratorAssessmentPayload): Promise<CollaboratorProgress> => {
  const baseUrls = getProgressWriteBaseUrls();

  if (baseUrls.length) {
    for (const baseUrl of baseUrls) {
      try {
        if (isAppsScriptEndpoint(baseUrl)) {
          return await callAppsScriptPost<CollaboratorProgress>(baseUrl, "syncCollaboratorAssessment", payload);
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
      } catch {
        // Try next configured backend.
      }
    }

    // Keep progress tracking usable even if remote backend is unreachable.
    return upsertLocalAssessment(payload);
  }

  return upsertLocalAssessment(payload);
};

export const getCollaboratorProgress = async (collaboratorEmail: string): Promise<CollaboratorProgress> => {
  const email = normalizeEmail(collaboratorEmail);
  const baseUrls = getProgressLookupBaseUrls();
  const localMap = getLocalProgressMap();
  const normalizedLocal = normalizeProgressRecord(localMap[email]);
  const localRecord = progressBelongsToEmail(normalizedLocal, email) ? normalizedLocal : null;

  if (baseUrls.length) {
    let bestRemote: CollaboratorProgress | null = null;

    for (const baseUrl of baseUrls) {
      try {
        if (isAppsScriptEndpoint(baseUrl)) {
          const remote = await callAppsScriptGet<CollaboratorProgress>(baseUrl, "getCollaboratorProgress", { email });
          const normalizedRemote = normalizeProgressRecord(remote);
          const remoteRecord = progressBelongsToEmail(normalizedRemote, email) ? normalizedRemote : null;
          if (!remoteRecord) continue;

          if (!bestRemote || (hasMeaningfulProgressData(remoteRecord) && !hasMeaningfulProgressData(bestRemote))) {
            bestRemote = remoteRecord;
            continue;
          }

          if ((remoteRecord.updatedAt || "") > (bestRemote.updatedAt || "")) {
            bestRemote = remoteRecord;
          }
          continue;
        }

        const response = await fetch(`${baseUrl}/api/collaborators/progress/${encodeURIComponent(email)}`);
        if (!response.ok) continue;

        const remote = (await response.json()) as CollaboratorProgress;
        const normalizedRemote = normalizeProgressRecord(remote);
        const remoteRecord = progressBelongsToEmail(normalizedRemote, email) ? normalizedRemote : null;
        if (!remoteRecord) continue;

        if (!bestRemote || (hasMeaningfulProgressData(remoteRecord) && !hasMeaningfulProgressData(bestRemote))) {
          bestRemote = remoteRecord;
          continue;
        }

        if ((remoteRecord.updatedAt || "") > (bestRemote.updatedAt || "")) {
          bestRemote = remoteRecord;
        }
      } catch {
        // Try next configured backend.
      }
    }

    if (bestRemote && localRecord) return mergeProgressRecordPair(bestRemote, localRecord);
    return bestRemote || localRecord || createEmptyProgress(email);
  }

  // Fallback for environments without backend.
  return localRecord || createEmptyProgress(email);
};

export const listCollaboratorsProgress = async (): Promise<CollaboratorProgress[]> => {
  const baseUrls = getProgressLookupBaseUrls();
  const localMap = getLocalProgressMap();
  const localList = Object.values(localMap)
    .map((record) => normalizeProgressRecord(record))
    .filter((record): record is CollaboratorProgress => Boolean(record));

  if (baseUrls.length) {
    let mergedRemote: CollaboratorProgress[] = [];

    for (const baseUrl of baseUrls) {
      try {
        if (isAppsScriptEndpoint(baseUrl)) {
          const remote = await callAppsScriptGet<CollaboratorProgress[]>(baseUrl, "listCollaboratorsProgress");
          const remoteList = (Array.isArray(remote) ? remote : [])
            .map((record) => normalizeProgressRecord(record))
            .filter((record): record is CollaboratorProgress => Boolean(record));
          mergedRemote = mergeProgressLists(mergedRemote, remoteList);
          continue;
        }

        const response = await fetch(`${baseUrl}/api/collaborators/progress`);
        if (!response.ok) continue;

        const remote = (await response.json()) as CollaboratorProgress[];
        const remoteList = (Array.isArray(remote) ? remote : [])
          .map((record) => normalizeProgressRecord(record))
          .filter((record): record is CollaboratorProgress => Boolean(record));
        mergedRemote = mergeProgressLists(mergedRemote, remoteList);
      } catch {
        // Try next configured backend.
      }
    }

    return mergeProgressLists(mergedRemote, localList);
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
