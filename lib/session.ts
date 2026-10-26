import type { Caretaker } from '@/types/database';
import { useMemo, useSyncExternalStore } from 'react';

export const SESSION_KEY = 'itpc_user';
const sessionEvent = 'itpc-session-change';

function subscribeToSession(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(sessionEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(sessionEvent, onChange);
  };
}

function parseCaretaker(stored: string | null): Caretaker | null {
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string' &&
      'name' in value &&
      typeof value.name === 'string'
    ) {
      return value as Caretaker;
    }
    return null;
  } catch {
    return null;
  }
}

export function useSessionCaretaker(): Caretaker | null | undefined {
  const stored = useSyncExternalStore(
    subscribeToSession,
    (): string | null | undefined => window.localStorage.getItem(SESSION_KEY),
    (): string | null | undefined => undefined,
  );
  return useMemo(() => stored === undefined ? undefined : parseCaretaker(stored), [stored]);
}

export function useCurrentDateKey(): string {
  return useSyncExternalStore(
    (onChange) => {
      const interval = window.setInterval(onChange, 60_000);
      window.addEventListener('focus', onChange);
      return () => {
        window.clearInterval(interval);
        window.removeEventListener('focus', onChange);
      };
    },
    () => new Date().toISOString().slice(0, 10),
    () => '1970-01-01',
  );
}

export function getStoredCaretaker(): Caretaker | null {
  if (typeof window === 'undefined') return null;
  return parseCaretaker(window.localStorage.getItem(SESSION_KEY));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  document.cookie = 'itpc_user_id=; path=/; max-age=0; samesite=lax';
  window.dispatchEvent(new Event(sessionEvent));
}

export function notifySessionChange(): void {
  window.dispatchEvent(new Event(sessionEvent));
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}
