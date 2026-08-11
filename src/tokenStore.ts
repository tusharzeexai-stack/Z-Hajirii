/**
 * tokenStore.ts
 *
 * In-Memory JS Closure Access Token Store.
 * Isolates short-lived Access Tokens in React JS memory state,
 * preventing browser extensions or XSS scripts from accessing tokens via localStorage/sessionStorage.
 */

let inMemoryToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

export const tokenStore = {
  getToken: (): string | null => {
    if (inMemoryToken) return inMemoryToken;
    return sessionStorage.getItem('zhajirii_token');
  },
  setToken: (token: string): void => {
    inMemoryToken = token;
    sessionStorage.setItem('zhajirii_token', token);
  },
  getRefreshToken: (): string | null => {
    if (inMemoryRefreshToken) return inMemoryRefreshToken;
    return sessionStorage.getItem('zhajirii_refresh_token');
  },
  setRefreshToken: (refreshToken: string): void => {
    inMemoryRefreshToken = refreshToken;
    sessionStorage.setItem('zhajirii_refresh_token', refreshToken);
  },
  clear: (): void => {
    inMemoryToken = null;
    inMemoryRefreshToken = null;
    sessionStorage.removeItem('zhajirii_token');
    sessionStorage.removeItem('zhajirii_refresh_token');
    sessionStorage.removeItem('zhajirii_session');
  }
};
