import { newId } from '../domain/model';
import type { TakeDraft } from '../domain/logging';

export interface Draft { input: TakeDraft; revision: number; editing: boolean }
const tabId = (() => {
  const preferred = newId();
  try {
    const existing = sessionStorage.getItem('opentake:tab');
    if (existing) return existing;
    sessionStorage.setItem('opentake:tab', preferred);
  } catch { /* Per-page identity still separates writes. */ }
  return preferred;
})();

export const draftPrefix = (projectId: string, takeId?: string) => `opentake:draft:${encodeURIComponent(projectId)}:${takeId === undefined ? 'new' : 'edit:' + encodeURIComponent(takeId)}:`;
export const ownDraftKey = (prefix: string) => prefix + tabId;

export function readDraft(key: string): Draft | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const draft = JSON.parse(raw) as Draft;
      if (draft?.input && typeof draft.input.id === 'string' && Number.isInteger(draft.revision)) return draft;
    }
  } catch { /* A browser may deny draft storage. */ }
  return undefined;
}

export function availableDrafts(prefix: string) {
  try {
    return Object.keys(localStorage).filter(key => key.startsWith(prefix) && key !== ownDraftKey(prefix))
      .flatMap(key => {
        const draft = readDraft(key);
        return draft ? [{ key, draft }] : [];
      });
  } catch { return []; }
}
