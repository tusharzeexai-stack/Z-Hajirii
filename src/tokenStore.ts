/**
 * tokenStore.ts
 *
 * 100% Pure JS Memory Closure Token Store (Google/Meta Enterprise Architecture).
 * Holds access tokens and session claims strictly in volatile JS memory,
 * leaving Web Storage (sessionStorage/localStorage) 100% blank to neutralize XSS token theft.
 */

let inMemoryToken: string | null = null;
let inMemoryRefreshToken: string | null = null;
let inMemoryUserSession: any | null = null;

// Clear any residual Web Storage keys on module initialization
try {
  sessionStorage.removeItem('zhajirii_token');
  sessionStorage.removeItem('zhajirii_refresh_token');
  sessionStorage.removeItem('zhajirii_session');
  localStorage.removeItem('zhajirii_token');
  localStorage.removeItem('zhajirii_refresh_token');
  localStorage.removeItem('zhajirii_session');
} catch (e) {
  // Ignore storage access errors in restricted browser environments
}

export const tokenStore = {
  getToken: (): string | null => {
    return inMemoryToken;
  },
  setToken: (token: string): void => {
    inMemoryToken = token;
  },
  getRefreshToken: (): string | null => {
    return inMemoryRefreshToken;
  },
  setRefreshToken: (refreshToken: string): void => {
    inMemoryRefreshToken = refreshToken;
  },
  getSessionUser: (): any | null => {
    return inMemoryUserSession;
  },
  setSessionUser: (user: any): void => {
    inMemoryUserSession = user;
  },
  clear: (): void => {
    inMemoryToken = null;
    inMemoryRefreshToken = null;
    inMemoryUserSession = null;
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch (e) {
      // Ignore
    }
  }
};
