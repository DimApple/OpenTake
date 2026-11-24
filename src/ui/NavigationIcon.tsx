const paths = {
  Takes: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  Log: 'M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm0 0L3 6l15-4 1 4-15 4m3-5 3 3m3-5 3 3',
  Scenes: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  Camera: 'M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm13 4 5-3v10l-5-3',
  Export: 'M12 15V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  Project: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
};

export function NavigationIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}
