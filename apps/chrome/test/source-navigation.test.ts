import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../src/viewer/render.js';
import { sourceRange } from '../src/viewer/selection.js';

it('reveals source-editor quotes ending in a line break without choosing another passage', () => {
  const source='# Heading\n\nA **formatted** paragraph.\n';
  const doc=new JSDOM(`<article>${renderMarkdown(source).html}</article>`).window.document;
  const start=source.indexOf('Heading');
  expect(sourceRange(doc.querySelector('article')!,source,start,start+'Heading\n'.length)?.toString()).toBe('Heading');
  expect(sourceRange(doc.querySelector('article')!,source,source.indexOf('\n'),source.indexOf('\n')+1)).toBeUndefined();
});
