import { z } from 'zod';

const text = z.string().max(100_000);
const name = text.refine(value => value.trim().length > 0, 'Cannot be blank');
const id = name.refine(value => value.length <= 200, 'ID is too long');
const timestamp = z.iso.datetime();
const date = z.iso.date();
const positive = z.number().positive();
const integer = z.number().int().positive();
export const settings = z.strictObject({
  cameraLabel: text.optional(), cameraType: text.optional(), cameraFps: positive.optional(),
  shutterSpeed: text.optional(), iso: integer.optional(), whitePointKelvin: integer.optional(),
  focalMm: positive.optional(), filter: text.optional(), aperture: text.optional(), cameraNotes: text.optional(),
});
export const settingSources = z.partialRecord(settings.keyof(), z.enum(['entered', 'previous', 'cameraDefault', 'cleared', 'imported']));
const overrides = z.strictObject({
  sceneNumber: text.optional(), shotNumber: text.optional(), dateRecorded: date.optional(),
  environment: z.enum(['INT', 'EXT']).optional(), location: text.optional(),
  dayNight: z.enum(['DAY', 'NIGHT']).optional(), description: text.optional(),
});
const archived = z.boolean().optional();
export const day = z.strictObject({ id, name, date: date.optional(), notes: text.optional(), archived });
export const scene = z.strictObject({ id, label: name, title: text.optional(), storyDay: text.optional(), description: text.optional(), archived });
export const slate = z.strictObject({ id, sceneId: id, label: name.optional(), tag: z.enum(['PU', 'RTK']).optional(), description: text.optional(), archived });
export const camera = z.strictObject({ id, label: name, cameraType: text.optional(), defaults: settings.optional(), archived });
export const status = z.enum(['unrated', 'preferred', 'rejected']);
export const take = z.strictObject({
  id, slateId: id, takeNumber: integer, status: status.optional(), dayId: id.optional(), cameraId: id.optional(),
  captureId: id.optional(), loggedAt: timestamp.optional(), rollCard: text.optional(), fileName: text.optional(),
  comments: text.optional(), keywords: z.array(text).optional(), soundRoll: text.optional(), soundFileName: text.optional(),
  soundNotes: text.optional(), mos: z.boolean().optional(), wildTrack: z.boolean().optional(),
  cameraSettings: settings.optional(), settingSources: settingSources.optional(), slateOverrides: overrides.optional(),
});
export const continuityNote = z.strictObject({
  id, description: name, department: text.optional(), subjectName: text.optional(), storyDay: text.optional(),
  notes: text.optional(), changeNote: text.optional(), sceneId: id.optional(), takeId: id.optional(),
});
export const projectShape = z.strictObject({
  projectId: id, schemaVersion: z.literal(1), title: name, createdAt: timestamp, updatedAt: timestamp,
  productionCompany: text.optional(), director: text.optional(), cinematographer: text.optional(),
  soundMixer: text.optional(), scriptSupervisor: text.optional(), notes: text.optional(),
  shootingDays: z.array(day), scenes: z.array(scene), slates: z.array(slate), cameras: z.array(camera),
  takes: z.array(take), continuityNotes: z.array(continuityNote),
});
export type Project = z.infer<typeof projectShape>;
export type LogTake = z.infer<typeof take>;
export type Settings = z.infer<typeof settings>;
export type SettingsSources = z.infer<typeof settingSources>;
export const newId = () => crypto.randomUUID();

export function validateProject(input: unknown): Project {
  const project = projectShape.parse(input);
  const { shootingDays, scenes, slates, cameras, takes, continuityNotes } = project;
  for (const list of [shootingDays, scenes, slates, cameras, takes, continuityNotes]) {
    if (new Set(list.map(item => item.id)).size !== list.length) throw new Error('Duplicate record ID.');
  }
  const sceneIds = new Set(scenes.map(item => item.id));
  const dayIds = new Set(shootingDays.map(item => item.id));
  const slateIds = new Set(slates.map(item => item.id));
  const cameraIds = new Set(cameras.map(item => item.id));
  const takeIds = new Set(takes.map(item => item.id));
  if (slates.some(item => !sceneIds.has(item.sceneId))) throw new Error('A shot refers to a missing scene.');
  const keys = new Set<string>();
  for (const item of takes) {
    if (!slateIds.has(item.slateId) || (item.dayId && !dayIds.has(item.dayId)) || (item.cameraId && !cameraIds.has(item.cameraId))) {
      throw new Error('A take refers to a missing shot, day or camera.');
    }
    if (item.mos && item.wildTrack) throw new Error('A take cannot be both MOS and wild track.');
    if (item.settingSources && Object.entries(item.settingSources).some(([key, source]) =>
      (source === 'cleared') === (item.cameraSettings?.[key as keyof Settings] !== undefined))) {
      throw new Error('A setting source conflicts with its recorded value.');
    }
    const key = JSON.stringify([item.slateId, item.cameraId, item.takeNumber]);
    if (item.cameraId && keys.has(key)) throw new Error('That take number already exists for this shot and camera.');
    if (item.cameraId) keys.add(key);
  }
  if (continuityNotes.some(item => (item.sceneId && !sceneIds.has(item.sceneId)) || (item.takeId && !takeIds.has(item.takeId)))) {
    throw new Error('A continuity note refers to a missing scene or take.');
  }
  return project;
}

export function createProject(title: string): Project {
  const now = new Date().toISOString();
  return validateProject({
    projectId: newId(), schemaVersion: 1, title, createdAt: now, updatedAt: now,
    shootingDays: [], scenes: [], slates: [], cameras: [], takes: [], continuityNotes: [],
  });
}
