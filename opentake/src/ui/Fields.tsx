import type { InputHTMLAttributes } from 'react';
import type { Settings } from '../domain/model';

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label>{label}<input {...props} /></label>;
}

export function Select({ label, value, onChange, options, blank = 'Select…' }: {
  label: string; value: string; onChange: (value: string) => void;
  options: readonly { id: string; label: string }[]; blank?: string;
}) {
  return <label>{label}<select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">{blank}</option>
    {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select></label>;
}

const core = [['focalMm', 'Lens (mm)'], ['cameraFps', 'FPS'], ['iso', 'ISO'], ['whitePointKelvin', 'White balance (K)']] as const;
const extra = [
  ['cameraType', 'Camera model'], ['cameraLabel', 'Recorded camera label'], ['shutterSpeed', 'Shutter'],
  ['filter', 'Filter'], ['aperture', 'Aperture'], ['cameraNotes', 'Camera notes'],
] as const;
export function SettingsFields({ values, onChange }: { values: Settings; onChange: (key: keyof Settings, value: string | number | undefined) => void }) {
  return <>
    <div className="settings">{core.map(([key, label]) =>
      <Field key={key} label={label} type="number" min="0" step="any" value={values[key] ?? ''}
        onChange={event => onChange(key, event.target.value ? event.target.valueAsNumber : undefined)} />)}</div>
    <details><summary>More camera settings</summary><div className="grid">{extra.map(([key, label]) =>
      <Field key={key} label={label} value={values[key] ?? ''} onChange={event => onChange(key, event.target.value || undefined)} />)}</div></details>
  </>;
}
