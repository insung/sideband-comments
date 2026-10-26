import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../src/viewer/render.js';
import { selectionOffsets, sourceRange } from '../src/viewer/selection.js';

it('maps punctuation inside explicit link labels in a formatted paragraph', () => {
  const source='A **proposal** for [002-design.md](002-design.md) and [004-data-sample.md](004-data-sample.md).';
  const doc=new JSDOM(`<article>${renderMarkdown(source).html}</article>`).window.document;
  const article=doc.querySelector('article')!, paragraph=article.querySelector('p')!;
  const range=doc.createRange(); range.selectNodeContents(paragraph);
  expect(selectionOffsets(source,range)).toEqual({start:0,end:source.length});
  expect(sourceRange(article,source,0,source.length)?.toString()).toBe(paragraph.textContent);
});

it('reveals source-editor quotes ending in a line break without choosing another passage', () => {
  const source='# Heading\n\nA **formatted** paragraph.\n';
  const doc=new JSDOM(`<article>${renderMarkdown(source).html}</article>`).window.document;
  const start=source.indexOf('Heading');
  expect(sourceRange(doc.querySelector('article')!,source,start,start+'Heading\n'.length)?.toString()).toBe('Heading');
  expect(sourceRange(doc.querySelector('article')!,source,source.indexOf('\n'),source.indexOf('\n')+1)).toBeUndefined();
});
