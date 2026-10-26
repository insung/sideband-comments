import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { installPanelResizers } from '../src/viewer/panel-widths.js';

function setup(initial: unknown = {}) {
  const dom = new JSDOM('<div id="sideband-reader"><nav></nav><main></main><aside></aside></div>');
  const layout = dom.window.document.querySelector<HTMLDivElement>('div')!;
  Object.defineProperty(dom.window, 'innerWidth', {value:1600, configurable:true});
  const save = vi.fn();
  installPanelResizers(layout, initial, save);
  const key = (side: string, key: string) => layout.querySelector(`[data-panel="${side}"]`)!.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key,bubbles:true}));
  return {dom,layout,save,key};
}
describe('panel widths', () => {
  it('restores saved widths, supports independent keyboard resizing and persists changes', () => {
    const {layout,save,key} = setup({left:280,right:400});
    expect(layout.style.getPropertyValue('--toc-width')).toBe('280px');
    key('left','ArrowRight'); key('right','ArrowLeft');
    expect(layout.style.getPropertyValue('--toc-width')).toBe('296px');
    expect(layout.style.getPropertyValue('--comments-width')).toBe('416px');
    expect(save).toHaveBeenLastCalledWith({left:296,right:416});
    expect(layout.querySelector('[data-panel="left"]')?.getAttribute('aria-valuenow')).toBe('296');
  });
  it('limits widths, leaves room for the article, and ignores invalid saved preferences', () => {
    const {layout,key} = setup({left:Infinity,right:'bad'});
    expect(layout.style.getPropertyValue('--toc-width')).toBe('220px');
    expect(layout.style.getPropertyValue('--comments-width')).toBe('340px');
    for(let i=0;i<50;i++) key('left','ArrowRight');
    expect(Number.parseFloat(layout.style.getPropertyValue('--toc-width'))).toBe(480);
    for(let i=0;i<50;i++) key('right','ArrowLeft');
    expect(Number.parseFloat(layout.style.getPropertyValue('--comments-width'))).toBeLessThanOrEqual(640);
    expect(Number.parseFloat(layout.style.getPropertyValue('--toc-width')) + Number.parseFloat(layout.style.getPropertyValue('--comments-width')) + 12 + 320).toBeLessThanOrEqual(1600);
  });
  it('resizes using pointer movement and commits once on release', () => {
    const {dom,layout,save} = setup(); const handle = layout.querySelector('[data-panel="right"]')!;
    handle.dispatchEvent(new dom.window.MouseEvent('pointerdown',{clientX:1200,button:0,bubbles:true}));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove',{clientX:1140,bubbles:true}));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup',{bubbles:true}));
    expect(layout.style.getPropertyValue('--comments-width')).toBe('400px');
    expect(save).toHaveBeenCalledExactlyOnceWith({left:220,right:400});
  });
  it('retains preferred desktop widths when the window shrinks and restores them when it grows', () => {
    const {dom,layout} = setup({left:400,right:600});
    Object.defineProperty(dom.window,'innerWidth',{value:800,configurable:true}); dom.window.dispatchEvent(new dom.window.Event('resize'));
    expect(Number.parseFloat(layout.style.getPropertyValue('--comments-width'))).toBeLessThanOrEqual(474);
    Object.defineProperty(dom.window,'innerWidth',{value:1600,configurable:true}); dom.window.dispatchEvent(new dom.window.Event('resize'));
    expect(layout.style.getPropertyValue('--comments-width')).toBe('600px');
  });
});
