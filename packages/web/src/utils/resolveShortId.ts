import { useAppStore } from '../stores/appStore';

/** Resolve a short ID prefix to a full agent ID. */
export function resolveShortId(shortId: string): string | null {
  const agents = useAppStore.getState().agents;
  const match = agents.find((a) => a.id.startsWith(shortId));
  return match?.id ?? null;
}
