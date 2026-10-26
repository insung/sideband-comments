import { expect, it } from 'vitest';
import { renderMarkdown } from '../src/viewer/render.js';

it('renders a long paragraph within the host document limit without overflowing the call stack', () => {
  const source='a'.repeat(150_000);
  expect(renderMarkdown(source).html).toContain(source);
});
