const CAPITAL_HUMANO_AUTH_KEY = 'uix-capital-humano-auth-v1';
const DEFAULT_CAPITAL_HUMANO_ACCESS_CODE = 'uix-capital-humano';

const getConfiguredAccessCode = (): string => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  return env?.VITE_CAPITAL_HUMANO_ACCESS_CODE?.trim() || DEFAULT_CAPITAL_HUMANO_ACCESS_CODE;
};

export const isUsingDefaultCapitalHumanoCode = (): boolean => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  return !env?.VITE_CAPITAL_HUMANO_ACCESS_CODE?.trim();
};

export const isCapitalHumanoAuthenticated = (): boolean => {
  try {
    return sessionStorage.getItem(CAPITAL_HUMANO_AUTH_KEY) === 'true';
  } catch {
    return false;
  }
};

export const authenticateCapitalHumano = (accessCode: string): boolean => {
  const isValid = accessCode.trim() === getConfiguredAccessCode();
  if (!isValid) return false;

  try {
    sessionStorage.setItem(CAPITAL_HUMANO_AUTH_KEY, 'true');
  } catch {
    // Ignore storage failures.
  }

  return true;
};

export const clearCapitalHumanoAuth = (): void => {
  try {
    sessionStorage.removeItem(CAPITAL_HUMANO_AUTH_KEY);
  } catch {
    // Ignore storage failures.
  }
};
