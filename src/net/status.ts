import { api } from './api';

/**
 * Is the site open for play? Fails OPEN: offline players (the game runs from the service-worker cache),
 * a busy server or a missing backend must never lock anyone out. Only an explicit "closed" from staff does.
 */
export async function fetchOpen(): Promise<boolean> {
  try {
    const r = await api<{ open: boolean }>('/status');
    return r.open !== false;
  } catch {
    return true;
  }
}
