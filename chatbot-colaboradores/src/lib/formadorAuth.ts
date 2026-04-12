const FORMADOR_AUTH_KEY = 'uix-formador-auth-v1';
const DEFAULT_FORMADOR_ACCESS_CODE = 'uix-formador';

const getConfiguredAccessCode = (): string => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  return env?.VITE_FORMADOR_ACCESS_CODE?.trim() || DEFAULT_FORMADOR_ACCESS_CODE;
};

export const isFormadorAuthenticated = (): boolean => {
  try {
    return sessionStorage.getItem(FORMADOR_AUTH_KEY) === 'true';
  } catch {
    return false;
  }
};

export const authenticateFormador = (accessCode: string): boolean => {
  const isValid = accessCode.trim() === getConfiguredAccessCode();
  if (!isValid) return false;

  try {
    sessionStorage.setItem(FORMADOR_AUTH_KEY, 'true');
  } catch {
    // Ignore storage failures.
  }

  return true;
};

export const clearFormadorAuth = (): void => {
  try {
    sessionStorage.removeItem(FORMADOR_AUTH_KEY);
  } catch {
    // Ignore storage failures.
  }
};
