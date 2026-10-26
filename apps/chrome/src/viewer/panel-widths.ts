export interface PanelWidths { left: number; right: number }
const defaults: PanelWidths = { left: 220, right: 340 };
const limits = { left: [160, 480], right: [240, 640] } as const;
type Side = keyof PanelWidths;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Preferences belong to the extension, never to the Markdown or comment store. */
export function installPanelResizers(layout: HTMLElement, initial: unknown, save: (widths: PanelWidths) => void): () => void {
  const win = layout.ownerDocument.defaultView!;
  const preferred = { ...defaults };
  for (const side of ['left', 'right'] as const) {
    const value = initial && typeof initial === 'object' && side in initial ? (initial as PanelWidths)[side] : undefined;
    if (typeof value === 'number' && Number.isFinite(value)) preferred[side] = clamp(value, limits[side][0], limits[side][1]);
  }
  const handles = {} as Record<Side, HTMLDivElement>;
  let effective: PanelWidths;
  const hasLeft = () => win.innerWidth > 1100 && !layout.classList.contains('sideband-hide-toc');
  const apply = () => {
    const width = layout.getBoundingClientRect().width || win.innerWidth;
    const left = hasLeft() ? Math.min(preferred.left, Math.max(160, width - 320 - 12 - 240)) : 0;
    const right = win.innerWidth > 720 ? Math.min(preferred.right, Math.max(240, width - left - 320 - (hasLeft() ? 12 : 6))) : preferred.right;
    effective = {left: hasLeft() ? left : preferred.left, right};
    layout.style.setProperty('--toc-width', `${effective.left}px`);
    layout.style.setProperty('--comments-width', `${effective.right}px`);
    for (const side of ['left','right'] as const) handles[side].setAttribute('aria-valuenow', String(effective[side]));
  };
  const update = (side: Side, value: number) => {
    const width = layout.getBoundingClientRect().width || win.innerWidth;
    const other = side === 'left' ? effective.right : hasLeft() ? effective.left : 0;
    preferred[side] = clamp(value, limits[side][0], Math.min(limits[side][1], Math.max(limits[side][0], width - other - 320 - (hasLeft() ? 12 : 6))));
    apply();
  };
  for (const side of ['left','right'] as const) {
    const handle = layout.ownerDocument.createElement('div');
    handles[side] = handle;
    handle.className = 'sideband-resizer'; handle.dataset.panel = side;
    handle.tabIndex = 0; handle.setAttribute('role','separator'); handle.setAttribute('aria-orientation','vertical');
    handle.setAttribute('aria-label', side === 'left' ? 'Table of contents width' : 'Comments panel width');
    handle.setAttribute('aria-valuemin',String(limits[side][0])); handle.setAttribute('aria-valuemax',String(limits[side][1]));
    const enabled = () => side === 'left' ? hasLeft() : win.innerWidth > 720;
    const persist = () => save({...preferred});
    handle.addEventListener('keydown', event => {
      if (!enabled() || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const direction = side === 'left' ? 1 : -1;
      update(side,event.key === 'Home' ? limits[side][0] : event.key === 'End' ? limits[side][1] : effective[side] + (event.key === 'ArrowRight' ? 16 : -16) * direction);
      persist();
    });
    handle.addEventListener('pointerdown', event => {
      if (!enabled() || event.button !== 0 || layout.classList.contains('sideband-resizing')) return;
      event.preventDefault();
      const startX = event.clientX, startWidth = effective[side], previous = preferred[side];
      layout.classList.add('sideband-resizing');
      const move = (next: PointerEvent) => update(side,startWidth + (next.clientX - startX) * (side === 'left' ? 1 : -1));
      const cleanup = () => { win.removeEventListener('pointermove',move); win.removeEventListener('pointerup',finish); win.removeEventListener('pointercancel',cancel); win.removeEventListener('blur',cancel); layout.classList.remove('sideband-resizing'); };
      const finish = () => { cleanup(); persist(); };
      const cancel = () => { cleanup(); preferred[side] = previous; apply(); };
      win.addEventListener('pointermove',move); win.addEventListener('pointerup',finish); win.addEventListener('pointercancel',cancel); win.addEventListener('blur',cancel);
    });
  }
  layout.children[0]!.after(handles.left);
  layout.children[2]!.after(handles.right);
  apply(); win.addEventListener('resize',apply);
  return apply;
}
