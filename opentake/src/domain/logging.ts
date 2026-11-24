import { newId, type LogTake, type Project, type Settings, type SettingsSources } from './model';
import { seedNextTake } from './sticky';
import { taggedShotNumber } from './slate';
import { applyReconciliation, parseCardListing, reconcileFileNames, type ReconciliationResult } from './fileNames';
import type { Take } from './types';

export function slateName(project: Project, slateId: string) {
  const slate = project.slates.find(item => item.id === slateId);
  if (!slate) return '';
  const scene = project.scenes.find(item => item.id === slate.sceneId);
  return [scene?.label, taggedShotNumber(slate.label, slate.tag)].filter(Boolean).join(' / ');
}

export interface PendingShot { sceneId: string; label: string; sceneLabel?: string }
export type TakeDraft = LogTake & { pendingShot?: PendingShot };

export function findScene(project: Project, label: string) {
  const wanted = label.trim().toLowerCase();
  return project.scenes.find(scene => !scene.archived && scene.label.toLowerCase() === wanted);
}

export function stepScene(label: string, direction: -1 | 1): string | undefined {
  if (!label.trim()) return direction === 1 ? '1' : undefined;
  const match = /^(\d+)([a-z]*)$/i.exec(label.trim());
  if (!match) return undefined;
  const next = Number(match[1]) + direction;
  if (!Number.isSafeInteger(next) || next < 1) return undefined;
  return String(next).padStart(match[1].length, '0') + match[2];
}

export function stepShot(label: string, direction: -1 | 1): string | undefined {
  const value = label.trim();
  if (!value) return direction === 1 ? 'A' : undefined;
  if (/^\d+$/.test(value)) return stepScene(value, direction) ?? (Number(value) === 1 && direction === -1 ? '' : undefined);
  const match = /^(\d*)([a-z]{1,8})$/i.exec(value);
  if (!match) return undefined;
  const [, prefix, letters] = match;
  let ordinal = 0;
  for (const letter of letters.toUpperCase()) ordinal = ordinal * 26 + letter.charCodeAt(0) - 64;
  ordinal += direction;
  if (ordinal === 0) return prefix ? undefined : '';
  let result = '';
  while (ordinal > 0) {
    ordinal--;
    result = String.fromCharCode(65 + ordinal % 26) + result;
    ordinal = Math.floor(ordinal / 26);
  }
  return prefix + (letters === letters.toLowerCase() ? result.toLowerCase() : result);
}

export function findShot(project: Project, sceneId: string, label: string) {
  const wanted = label.trim().toLowerCase();
  return project.slates.find(slate => slate.sceneId === sceneId && !slate.archived
    && taggedShotNumber(slate.label, slate.tag).toLowerCase() === wanted);
}

/** OpenTake adapter for the upstream carry/reset and numbering rules. */
export function draftTake(project: Project, dayId: string, slateId: string, cameraId: string): LogTake {
  const camera = project.cameras.find(item => item.id === cameraId);
  const slate = project.slates.find(item => item.id === slateId);
  const scoped = project.takes.filter(item => item.cameraId === cameraId);
  const adapt = (item: LogTake): Take => ({
    id: item.id, shotId: item.slateId, takeNumber: item.takeNumber,
    rollCard: item.rollCard, soundRoll: item.soundRoll, keywords: item.keywords,
  });
  const dayTakes = scoped.filter(item => item.dayId === dayId)
    .sort((a, b) => (a.loggedAt ?? '').localeCompare(b.loggedAt ?? ''));
  const previous = dayTakes.at(-1);
  const sameSlate = dayTakes.filter(item => item.slateId === slateId).at(-1);
  const seeded = seedNextTake(scoped.map(adapt), {
    id: newId(), shotId: slateId, productionDayId: dayId, previous: previous && adapt(previous),
  }).take;
  const { rollCard, soundRoll, takeNumber, id } = seeded;
  const cameraSettings: Settings = { cameraType: camera?.cameraType, ...camera?.defaults };
  const settingSources: SettingsSources = {};
  for (const key of Object.keys(cameraSettings) as Array<keyof Settings>) {
    if (cameraSettings[key] !== undefined) settingSources[key] = 'cameraDefault';
  }
  Object.assign(cameraSettings, previous?.cameraSettings);
  for (const key of Object.keys(previous?.cameraSettings ?? {}) as Array<keyof Settings>) settingSources[key] = 'previous';
  for (const key of Object.keys(previous?.settingSources ?? {}) as Array<keyof Settings>) {
    if (previous?.settingSources?.[key] === 'cleared') {
      delete cameraSettings[key];
      settingSources[key] = 'cleared';
    }
  }
  return {
    id, takeNumber, dayId, slateId, cameraId, rollCard, soundRoll, status: 'unrated',
    keywords: sameSlate?.keywords?.slice(), cameraSettings, settingSources,
    slateOverrides: slate && sameSlate?.slateOverrides && { ...sameSlate.slateOverrides },
  };
}

export function saveTake(project: Project, input: TakeDraft, editing: boolean): Project {
  const { pendingShot, ...draft } = input;
  if (pendingShot) {
    let sceneId = pendingShot.sceneId;
    if (!sceneId && pendingShot.sceneLabel?.trim()) {
      const existingScene = findScene(project, pendingShot.sceneLabel);
      sceneId = existingScene?.id ?? newId();
      if (!existingScene) project = { ...project, scenes: [...project.scenes, { id: sceneId, label: pendingShot.sceneLabel.trim() }] };
    }
    if (!sceneId) throw new Error('Enter a scene.');
    const existing = findShot(project, sceneId, pendingShot.label);
    draft.slateId = existing?.id ?? newId();
    if (!existing) {
      project = { ...project, slates: [...project.slates, {
        id: draft.slateId, sceneId, label: pendingShot.label.trim() || undefined,
      }] };
    }
  }
  if (editing) {
    if (!project.takes.some(item => item.id === draft.id)) throw new Error('This take no longer exists.');
    return { ...project, takes: project.takes.map(item => item.id === draft.id ? draft : item) };
  }
  if (!draft.dayId || !draft.cameraId || !draft.slateId) throw new Error('Select a day, scene and camera.');
  return { ...project, takes: [...project.takes, { ...draft, loggedAt: new Date().toISOString() }] };
}

export function previewClips(project: Project, day: string, camera: string, roll: string, text: string) {
  if (!day || !camera || !roll.trim()) throw new Error('Choose a day, camera and roll.');
  const takes = project.takes.filter(item => item.dayId === day && item.cameraId === camera && item.rollCard === roll && !item.wildTrack)
    .sort((a, b) => (a.loggedAt ?? '').localeCompare(b.loggedAt ?? ''));
  const files = parseCardListing(text);
  if (!files.length || new Set(files).size !== files.length) throw new Error('Provide a nonempty list of distinct filenames in recording order.');
  return reconcileFileNames(takes, files);
}

export function assignClips(project: Project, preview: ReconciliationResult): Project {
  if (preview.hasDrift || !preview.matchedCount) throw new Error('Match the take and filename counts before applying.');
  return { ...project, takes: applyReconciliation(project.takes, preview) };
}

export function deleteTakes(project: Project, ids: ReadonlySet<string>): Project {
  if (!ids.size) return project;
  if (project.takes.filter(take => ids.has(take.id)).length !== ids.size) {
    throw new Error('One or more selected takes no longer exist.');
  }
  return {
    ...project,
    takes: project.takes.filter(take => !ids.has(take.id)),
    continuityNotes: project.continuityNotes.map(note =>
      note.takeId && ids.has(note.takeId) ? { ...note, takeId: undefined } : note),
  };
}
