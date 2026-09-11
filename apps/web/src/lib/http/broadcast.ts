/**
 * Keeps multiple tabs in sync when one of them logs out (doc 04 section
 * 3.3). Falls back to a no-op silently — BroadcastChannel is unsupported in
 * a handful of older WebViews and that must never crash the app.
 */
const CHANNEL_NAME = 'auth-sync';

type AuthSyncMessage = { type: 'logout' } | { type: 'login' };

let channel: BroadcastChannel | null = null;
try {
  channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
} catch {
  channel = null;
}

export function broadcastAuthEvent(message: AuthSyncMessage): void {
  channel?.postMessage(message);
}

export function onAuthEvent(handler: (message: AuthSyncMessage) => void): () => void {
  if (!channel) return () => {};
  const listener = (event: MessageEvent<AuthSyncMessage>) => handler(event.data);
  channel.addEventListener('message', listener);
  return () => channel?.removeEventListener('message', listener);
}
