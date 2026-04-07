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

const LOCAL_PROGRESS_KEY = "uix-collaborator-progress-v1";

const getApiBaseUrl = (): string => {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL;
  return fromEnv ? fromEnv.replace(/\/$/, "") : "";
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
    const response = await fetch(`${baseUrl}/api/collaborators/progress/${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch collaborator progress: ${response.status}`);
    }

    return (await response.json()) as CollaboratorProgress;
  }

  // Fallback for environments without backend.
  const map = getLocalProgressMap();
  return map[email] || createEmptyProgress(email);
};

export const listCollaboratorsProgress = async (): Promise<CollaboratorProgress[]> => {
  const baseUrl = getApiBaseUrl();

  if (baseUrl) {
    const response = await fetch(`${baseUrl}/api/collaborators/progress`);
    if (!response.ok) {
      throw new Error(`Failed to fetch collaborators progress list: ${response.status}`);
    }

    return (await response.json()) as CollaboratorProgress[];
  }

  const map = getLocalProgressMap();
  return Object.values(map).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};
