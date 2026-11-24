import { createProject, newId, validateProject, type LogTake, type Project } from '../domain/model';

const takeFields = {
  capture_id: 'captureId', logged_at: 'loggedAt', roll_card: 'rollCard', file_name: 'fileName',
  comments: 'comments', keywords_json: 'keywords', sound_roll: 'soundRoll', sound_file_name: 'soundFileName',
  sound_notes: 'soundNotes', mos: 'mos', wild_track: 'wildTrack', status: 'status',
} as const;
const settingsFields = {
  recorded_camera_label: 'cameraLabel', camera_type: 'cameraType', camera_fps: 'cameraFps',
  shutter_speed: 'shutterSpeed', iso: 'iso', white_point_kelvin: 'whitePointKelvin', focal_mm: 'focalMm',
  filter: 'filter', aperture: 'aperture', camera_notes: 'cameraNotes',
} as const;
const slateFields = {
  recorded_scene_number: 'sceneNumber', recorded_slate_label: 'shotNumber', recorded_date: 'dateRecorded',
  environment: 'environment', location: 'location', day_night: 'dayNight', description: 'description',
} as const;
const headers = [
  'csv_version', 'text_encoding', 'project_id', 'project_title', 'take_id', 'capture_id',
  'day_id', 'day_name', 'day_date', 'scene_id', 'scene_label', 'slate_id', 'slate_label', 'slate_tag', 'take_number',
  'camera_id', 'camera_label', 'status', 'logged_at', 'roll_card', 'file_name', 'comments', 'keywords_json',
  'sound_roll', 'sound_file_name', 'sound_notes', 'mos', 'wild_track',
  ...Object.keys(settingsFields), 'setting_sources_json', ...Object.keys(slateFields),
];
const numeric = new Set(['take_number', 'camera_fps', 'iso', 'white_point_kelvin', 'focal_mm']);
const boolean = new Set(['mos', 'wild_track']);
const structured = new Set(['setting_sources_json', 'keywords_json']);
const literal = new Set(['csv_version', 'text_encoding', 'status', 'slate_tag', 'environment', 'day_night']);
const textColumn = (key: string) => !numeric.has(key) && !boolean.has(key) && !structured.has(key) && !literal.has(key);
const quote = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export function exportCsv(project: Project) {
  if (!project.takes.length) throw new Error('Log a take before exporting CSV. Use .otake for an empty project.');
  const days = new Map(project.shootingDays.map(day => [day.id, day]));
  const scenes = new Map(project.scenes.map(scene => [scene.id, scene]));
  const slates = new Map(project.slates.map(slate => [slate.id, slate]));
  const cameras = new Map(project.cameras.map(camera => [camera.id, camera]));
  const lines = project.takes.map(take => {
    const slate = slates.get(take.slateId);
    const day = take.dayId ? days.get(take.dayId) : undefined;
    const scene = slate && scenes.get(slate.sceneId);
    const camera = take.cameraId ? cameras.get(take.cameraId) : undefined;
    const row: Record<string, unknown> = {
      csv_version: '1', text_encoding: 'apostrophe-v1', project_id: project.projectId, project_title: project.title,
      take_id: take.id, take_number: take.takeNumber, day_id: day?.id, day_name: day?.name, day_date: day?.date,
      scene_id: scene?.id, scene_label: scene?.label, slate_id: slate?.id, slate_label: slate?.label,
      slate_tag: slate?.tag, camera_id: camera?.id, camera_label: camera?.label, setting_sources_json: take.settingSources,
    };
    for (const [column, field] of Object.entries(takeFields)) row[column] = take[field];
    for (const [column, field] of Object.entries(settingsFields)) row[column] = take.cameraSettings?.[field];
    for (const [column, field] of Object.entries(slateFields)) row[column] = take.slateOverrides?.[field];
    return headers.map(column => {
      const value = row[column];
      const string = value === undefined ? '' : structured.has(column) ? JSON.stringify(value) : String(value);
      return quote(textColumn(column) && (value === '' || /^(?:['\t\r\n]|\s*[=+\-@])/u.test(string)) ? "'" + string : string);
    }).join(',');
  });
  return [headers.join(','), ...lines].join('\r\n') + '\r\n';
}

/** Strict tokenizer based on the upstream CSV quoting rules. */
export function csvRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let mode: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  const cell = () => { row.push(field); field = ''; mode = 'start'; };
  const line = () => { cell(); rows.push(row); row = []; };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (mode === 'quoted') {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') { field += '"'; index++; }
      else mode = 'closed';
    } else if (char === ',') cell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      line();
    } else if (mode === 'closed' || (char === '"' && mode !== 'start')) {
      throw new Error(`Unexpected quote or characters in CSV record ${rows.length + 1}.`);
    } else if (char === '"') mode = 'quoted';
    else { field += char; mode = 'plain'; }
  }
  if (mode === 'quoted') throw new Error('Unterminated quoted CSV field.');
  if (mode !== 'start' || row.length) line();
  return rows;
}

export function importCsv(text: string) {
  if (text.length > 16 * 1024 * 1024) throw new Error('CSV exceeds the size limit.');
  const [columns, ...rows] = csvRows(text);
  if (!columns || !rows.length) throw new Error('CSV contains no take rows.');
  if (new Set(columns).size !== columns.length || columns.some(column => !column.trim())) throw new Error('CSV headers must be unique and nonempty.');
  const supported = columns.filter(column => headers.includes(column));
  const unsupported = columns.filter(column => !headers.includes(column));
  if (!['scene_label', 'take_number'].every(column => supported.includes(column))) {
    throw new Error('CSV requires scene_label and take_number headers. Rename source columns to match the documented format.');
  }
  const project = createProject('Untitled CSV import');
  const takeById = new Map<string, LogTake>();
  let duplicates = 0;
  let identity: { id?: string; title?: string } | undefined;
  rows.forEach((cells, index) => {
    try {
      if (cells.length !== columns.length) throw new Error('Column count does not match the header.');
      const raw = Object.fromEntries(columns.map((column, i) => [column, cells[i]]));
      if ((columns.includes('csv_version') && raw.csv_version !== '1')
        || (columns.includes('text_encoding') && raw.text_encoding !== 'apostrophe-v1')) throw new Error('Unsupported CSV version or text encoding.');
      const get = (key: string): string | undefined => {
        const value = raw[key];
        return typeof value === 'string' && value !== ''
          ? raw.text_encoding === 'apostrophe-v1' && textColumn(key) ? value.replace(/^'/, '') : value
          : undefined;
      };
      const rowIdentity = { id: get('project_id'), title: get('project_title') };
      if (identity && (identity.id !== rowIdentity.id || identity.title !== rowIdentity.title)) throw new Error('Rows describe different projects.');
      identity = rowIdentity;
      const entity = <T extends { id: string }>(list: T[], givenId: string | undefined, data: Omit<T, 'id'>): string => {
        const same = (record: T) => Object.entries(data).every(([key, value]) => record[key as keyof T] === value);
        const matches = givenId ? list.filter(record => record.id === givenId) : list.filter(same);
        if (matches.length > 1 || (matches[0] && !same(matches[0]))) throw new Error('Conflicting or ambiguous entity labels.');
        if (matches[0]) return matches[0].id;
        const id = givenId ?? newId();
        list.push({ id, ...data } as T);
        return id;
      };
      const sceneLabel = get('scene_label');
      const slateLabel = get('slate_label') || undefined;
      if (!sceneLabel) throw new Error('A scene label is required.');
      const sceneId = entity(project.scenes, get('scene_id'), { label: sceneLabel });
      const slateId = entity(project.slates, get('slate_id'), { sceneId, label: slateLabel, tag: get('slate_tag') as 'PU' | 'RTK' | undefined });
      const cameraLabel = get('camera_label');
      const dayName = get('day_name');
      if ((get('camera_id') && !cameraLabel) || ((get('day_id') || get('day_date')) && !dayName)) {
        throw new Error('Camera/day IDs or dates need their corresponding labels.');
      }
      const cameraId = cameraLabel ? entity(project.cameras, get('camera_id'), { label: cameraLabel }) : undefined;
      const dayId = dayName ? entity(project.shootingDays, get('day_id'), { name: dayName, date: get('day_date') }) : undefined;
      const read = (column: string) => {
        const value = get(column);
        if (value === undefined) return undefined;
        if (structured.has(column)) return JSON.parse(value);
        if (numeric.has(column)) {
          if (!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) throw new Error(`Invalid numeric ${column}.`);
          return Number(value);
        }
        if (boolean.has(column)) {
          if (value !== 'true' && value !== 'false') throw new Error(`Invalid boolean ${column}.`);
          return value === 'true';
        }
        return value;
      };
      const mapped = (dictionary: Record<string, string>) => Object.fromEntries(
        Object.entries(dictionary).flatMap(([column, field]) => {
          const value = read(column);
          return value === undefined ? [] : [[field, value]];
        }),
      );
      const item = {
        id: get('take_id') ?? newId(), takeNumber: read('take_number'), slateId, cameraId, dayId,
        ...mapped(takeFields), cameraSettings: mapped(settingsFields),
        settingSources: read('setting_sources_json'), slateOverrides: mapped(slateFields),
      } as LogTake;
      const prior = takeById.get(item.id);
      if (prior) {
        if (JSON.stringify(prior) !== JSON.stringify(item)) throw new Error('Conflicting duplicate take ID.');
        duplicates++;
      } else {
        takeById.set(item.id, item);
        project.takes.push(item);
      }
    } catch (error) {
      throw new Error(`CSV record ${index + 2}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  project.projectId = identity?.id ?? project.projectId;
  project.title = identity?.title ?? project.title;
  const unknownCameraKeys = new Set<string>();
  let ambiguous = 0;
  for (const item of project.takes) {
    if (item.cameraId) continue;
    const key = JSON.stringify([item.slateId, item.takeNumber]);
    if (unknownCameraKeys.has(key)) ambiguous++;
    unknownCameraKeys.add(key);
  }
  return { project: validateProject(project), supported, unsupported, duplicates, ambiguous };
}
