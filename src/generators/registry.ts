// registry.ts — the plugin contract, preserved from window.SB.
//
// Same shape as the rc3 shell: registerGenerator({id,label,render}) (dedupes by
// id, notifies listeners) and onRegister(fn). The ONLY change vs the original is
// how generators are loaded: instead of runtime Babel + fetching plugins.json,
// the generator modules are real ES modules imported statically (see
// ./index.ts), each calling registerGenerator at import time.

export interface Generator {
  id: string;
  label: string;
  render: (props: any) => any;
}

const _registry: Generator[] = [];
const _listeners: Array<() => void> = [];

export function registerGenerator(g: Generator): void {
  if (!g || !g.id) return;
  const next = _registry.filter((x) => x.id !== g.id);
  next.push(g);
  _registry.length = 0;
  _registry.push(...next);
  _listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {}
  });
}

export function onRegister(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

export function getGenerators(): Generator[] {
  return _registry.slice();
}
