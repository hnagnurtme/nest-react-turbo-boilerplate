import { create } from 'zustand';

/**
 * The access token lives here, in `lib`, not in a feature: `lib/http/client`
 * needs to read it to attach the Authorization header, and `lib` may not
 * import anything above it in the layer order (doc 01 section 2.2). Richer
 * identity (user, memberships, active tenant) lives one layer up in
 * entities/session — this store only ever holds the raw string.
 */
interface TokenState {
  accessToken: string | null;
  setAccessToken: (token: string) => void;
  clearAccessToken: () => void;
}

export const useTokenStore = create<TokenState>((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken }),
  clearAccessToken: () => set({ accessToken: null }),
}));
