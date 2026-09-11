import { create } from 'zustand';

/**
 * The access token AND the CSRF synchronizer token live here, in `lib`, not
 * in a feature: `lib/http/client` needs to read both to attach headers, and
 * `lib` may not import anything above it in the layer order (doc 01 section
 * 2.2). Richer identity (user, memberships, active tenant) lives one layer
 * up in entities/session — this store only ever holds these two strings.
 *
 * The CSRF token is NOT read from a cookie: `document.cookie` is strictly
 * domain-isolated, so a cookie set by the API's origin is invisible to JS
 * running on the web app's origin in this project's cross-site deployment.
 * The backend instead returns it in the login/refresh response BODY (see
 * apps/api's modules/auth/auth.service.ts), which fetch() can read across
 * origins — so it is kept here in memory exactly like the access token.
 */
interface TokenState {
  accessToken: string | null;
  csrfToken: string | null;
  setTokens: (tokens: { accessToken: string; csrfToken: string }) => void;
  setAccessToken: (token: string) => void;
  clearTokens: () => void;
}

export const useTokenStore = create<TokenState>((set) => ({
  accessToken: null,
  csrfToken: null,
  setTokens: ({ accessToken, csrfToken }) => set({ accessToken, csrfToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearTokens: () => set({ accessToken: null, csrfToken: null }),
}));
