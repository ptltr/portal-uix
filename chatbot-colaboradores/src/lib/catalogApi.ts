const CATALOG_BASE_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_CATALOG_API_URL ||
  "https://script.google.com/macros/s/AKfycbynS_eP4l7Oq1LOYyE5tnBaPoEzQsUobFU4MjWAGtIZdOv66fyH7zFsGvaIdbujv2T9aA/exec";

export type CatalogQuestion = {
  competency_id: string;
  question_id: string;
  scenario: string;
  question: string;
  patterns_A: string;
  patterns_B: string;
  patterns_C: string;
  signals: string;
  empathy_response: string;
  fallback_level: string;
};

export type CatalogResource = {
  competency_id: string;
  development_level: string;
  active: boolean | string;
  [key: string]: unknown;
};

async function catalogGet<T>(
  action: string,
  params: Record<string, string> = {},
): Promise<T> {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${CATALOG_BASE_URL}?${qs}`);
  if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
  const data: unknown = await res.json();
  return (Array.isArray(data) ? data : []) as T;
}

export const getCatalogCompetencies = (roleId: string): Promise<CatalogQuestion[]> =>
  catalogGet("getCompetencies", { role_id: roleId });

export const getCatalogResources = (
  competencyId: string,
  developmentLevel: string,
): Promise<CatalogResource[]> =>
  catalogGet("getResources", {
    competency_id: competencyId,
    development_level: developmentLevel,
  });
