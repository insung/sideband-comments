import mermaid from 'mermaid';
let nextId=0;
mermaid.initialize({ startOnLoad:false, securityLevel:'strict', suppressErrorRendering:true, maxTextSize:50_000, flowchart:{htmlLabels:false} });
export async function renderDiagrams(container: HTMLElement): Promise<void> {
  for (const node of container.querySelectorAll<HTMLElement>('.sideband-mermaid')) {
    const definition=node.textContent || '';
    try {
      const {svg}=await mermaid.render(`sideband-diagram-${++nextId}`, definition);
      // Mermaid's strict renderer sanitizes its SVG; Markdown raw HTML is disabled separately.
      node.innerHTML=svg;
      node.setAttribute('aria-label','Mermaid diagram');
    } catch {
      node.textContent=`Mermaid diagram could not be rendered.\n\n${definition}`;
      node.dataset.error='true';
    }
  }
}
