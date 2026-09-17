(() => {
  const element = node => node instanceof Element ? node : node?.parentElement;
  function updateContext() {
    const selection = window.getSelection();
    const source = document.querySelector('.sideband-preview-source');
    const text = selection?.toString() ?? '';
    const start = selection?.rangeCount ? selection.getRangeAt(0).startContainer : null;
    const end = selection?.rangeCount ? selection.getRangeAt(0).endContainer : null;
    const first = element(start)?.closest('[data-line]');
    const last = element(end)?.closest('[data-line]');
    let context = {};
    if (source && text.trim() && first && last) {
      const startLine = Number(first.dataset.line);
      const lastLine = Number(last.dataset.line);
      const nextLines = [...document.querySelectorAll('[data-line]')]
        .map(node => Number(node.dataset.line)).filter(line => line > lastLine);
      context = {
        sidebandPreviewSelection: true,
        sidebandPreviewUri: source.dataset.uri,
        sidebandPreviewVersion: Number(source.dataset.version),
        sidebandPreviewText: text,
        sidebandPreviewStartLine: startLine,
        sidebandPreviewEndLine: nextLines.length ? Math.min(...nextLines) : lastLine + 1
      };
    }
    document.body.setAttribute('data-vscode-context', JSON.stringify(context));
  }
  document.addEventListener('selectionchange', updateContext);
  window.addEventListener('contextmenu', updateContext, true);
})();
