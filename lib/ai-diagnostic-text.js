/**
 * Validation diagnostics are plain text. Remove common inline Markdown that a
 * model may still emit so literal formatting markers never leak into the UI.
 */
export function normalizeAiDiagnosticText(value) {
  if (typeof value !== 'string') return value

  return value
    .replace(/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g, '$1')
    .replace(/__(\S(?:[\s\S]*?\S)?)__/g, '$1')
    .replace(/(^|[\s([{¿¡])\*(\S(?:[^*\n]*?\S)?)\*(?=$|[\s)\]}.!,;:?!])/g, '$1$2')
    .replace(/(^|[\s([{¿¡])_(\S(?:[^_\n]*?\S)?)_(?=$|[\s)\]}.!,;:?!])/g, '$1$2')
    .replace(/~~(\S(?:[\s\S]*?\S)?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
}
