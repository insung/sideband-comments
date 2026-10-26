import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

/** [rendered UTF16 offset, source UTF16 offset, exact run length]. */
export type SourceRun = [number, number, number];
type MarkedToken = Token & { sourcePositions?: (number | null)[] };

/** Keep parser provenance, never rediscover a label by searching rendered text. */
export function trackInlineSource(md: MarkdownIt): void {
  // markdown-it exposes State for plugins but its declaration omits the extension fields.
  const Base = md.inline.State;
  class SourceState extends Base {
    sourcePositions: (number | null)[] = [];
    sourceRuleStart: number | undefined;
    constructor(...args: ConstructorParameters<typeof Base>) {
      super(...args);
      let pending = this.pending;
      Object.defineProperty(this, 'pending', {
        get: () => pending,
        set: (value: string) => {
          if (value.startsWith(pending)) {
            const added = value.slice(pending.length);
            const at = this.sourceRuleStart ?? this.pos - added.length;
            const exact = this.src.slice(at, at + added.length) === added;
            for (let i = 0; i < added.length; i++) this.sourcePositions.push(exact ? at + i : null);
          } else if (pending.startsWith(value)) this.sourcePositions.length = value.length;
          else this.sourcePositions = Array(value.length).fill(null);
          pending = value;
        }
      });
    }
    override pushPending() {
      const positions = [...this.sourcePositions];
      const token = super.pushPending() as MarkedToken;
      token.sourcePositions = positions;
      this.sourcePositions = [];
      return token;
    }
  }
  md.inline.State = SourceState;
  for (const name of ['text', 'linkify', 'newline', 'escape', 'backticks', 'strikethrough', 'emphasis', 'link', 'image', 'autolink', 'html_inline', 'entity']) {
    // Ruler's public API intentionally exposes functions but not names; retain the
    // rule by name before replacing it. This adapter relies on the pinned parser's rule list.
    const ruler = md.inline.ruler as typeof md.inline.ruler & { __rules__: { name: string; fn: (state: SourceState, silent: boolean) => boolean }[] };
    const original = ruler.__rules__.find(rule => rule.name === name)!.fn;
    md.inline.ruler.at(name, (state, silent) => {
      const tracked = state as SourceState;
      const start = state.pos, count = state.tokens.length, previous = tracked.sourceRuleStart;
      tracked.sourceRuleStart = start;
      const accepted = original(tracked, silent);
      tracked.sourceRuleStart = previous;
      if (accepted && !silent) {
        let cursor = start;
        for (const token of state.tokens.slice(count) as MarkedToken[]) {
          if (token.type === 'code_inline' && name === 'backticks') {
            const from = start + token.markup.length;
            const to = state.pos - token.markup.length;
            if (state.src.slice(from, to) === token.content) {
              token.sourcePositions = Array.from({ length: token.content.length }, (_, i) => from + i);
            }
          }
          if (token.type === 'softbreak' && name === 'newline') token.sourcePositions = [start];
          if (token.sourcePositions || !['text', 'text_special'].includes(token.type)) continue;
          const exact = !['escape', 'entity'].includes(name) && state.src.slice(cursor, cursor + token.content.length) === token.content;
          token.sourcePositions = Array.from({ length: token.content.length }, (_, i) => exact ? cursor + i : null);
          cursor += token.content.length;
        }
      }
      return accepted;
    });
  }
  // Keep separate text tokens so provenance survives delimiter postprocessing.
  md.inline.ruler2.at('fragments_join', state => {
    let level = 0;
    for (const token of state.tokens) {
      if (token.nesting < 0) level--;
      token.level = level;
      if (token.nesting > 0) level++;
    }
    return true;
  });
  md.core.ruler.at('text_join', state => {
    for (const token of state.tokens) for (const child of token.children || []) {
      if (child.type === 'text_special') child.type = 'text';
    }
  });
}

export function inlineRuns(inline: Token, absolute: (number | null)[]): SourceRun[] {
  const runs: SourceRun[] = [];
  let visible = 0;
  for (const token of (inline.children || []) as MarkedToken[]) {
    if (token.type === 'text' || token.type === 'code_inline') {
      for (let i = 0; i < token.content.length; i++, visible++) {
        const relative = token.sourcePositions?.[i];
        const at = relative == null ? null : absolute[relative];
        if (at == null) continue;
        const last = runs[runs.length - 1];
        if (last && last[0] + last[2] === visible && last[1] + last[2] === at) last[2]++;
        else runs.push([visible, at, 1]);
      }
    } else if (token.type === 'softbreak') {
      const relative = token.sourcePositions?.[0];
      const at = relative == null ? null : absolute[relative];
      if (at != null) runs.push([visible, at, 1]);
      visible++;
    } else if (token.type === 'hardbreak') visible++;
    // Images contribute alt attributes, not DOM textContent. Hardbreak is <br>.
  }
  return runs;
}
