export function commentBodyWithOriginalText(originalText: string | undefined, body: string): string {
  if (originalText === undefined) return body;
  const quote = originalText.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
  return `**Original text**\n\n${quote}\n\n---\n\n**Comment**\n\n${body}`;
}
