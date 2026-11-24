import type { Project } from './model';
import { exportResolveCsv, type ContinuitySources } from './resolveCsv';
import { exportAle } from './ale';
import { cameraReport, soundReport } from './setReports';
import type { Take } from './types';

function reportInput(project: Project) {
  const sources: ContinuitySources = {
    title: project.title, productionCompany: project.productionCompany, director: project.director,
    cinematographer: project.cinematographer, productionDays: project.shootingDays,
    crewDefaults: { soundMixer: project.soundMixer, scriptSupervisor: project.scriptSupervisor },
    setups: project.scenes.map(scene => ({ id: scene.id, sceneNumber: scene.label,
      shots: project.slates.filter(slate => slate.sceneId === scene.id).map(slate => ({
        id: slate.id, shotNumber: slate.label, framingDescription: slate.description,
      })) })),
  };
  const tags = new Map(project.slates.map(item => [item.id, item.tag]));
  const cameras = new Map(project.cameras.map(item => [item.id, item.label]));
  const takes: Take[] = project.takes.map(take => ({
    ...take, shotId: take.slateId, productionDayId: take.dayId, slateTag: tags.get(take.slateId),
    isGoodTake: take.status === 'preferred' ? true : take.status === 'rejected' ? false : undefined,
    cameraOverrides: { ...take.cameraSettings, cameraLabel: take.cameraSettings?.cameraLabel
      ?? (take.cameraId && take.settingSources?.cameraLabel !== 'cleared' ? cameras.get(take.cameraId) : undefined) },
    slateOverrides: { ...take.slateOverrides, dateRecorded: take.slateOverrides?.dateRecorded?.replaceAll('-', '_') },
  }));
  return { takes, sources };
}

export function editorialCsv(project: Project) {
  const { takes, sources } = reportInput(project);
  return exportResolveCsv(takes, sources);
}

export function editorialAle(project: Project) {
  const { takes, sources } = reportInput(project);
  return exportAle(takes, sources);
}

export function dailyReports(project: Project, dayId: string, cameraId: string) {
  const { takes, sources } = reportInput(project);
  const day = takes.filter(take => !dayId || take.productionDayId === dayId);
  const camera = day.filter(take => !cameraId || project.takes.find(row => row.id === take.id)?.cameraId === cameraId);
  return { camera: cameraReport(camera, sources), sound: soundReport(day, sources) };
}
