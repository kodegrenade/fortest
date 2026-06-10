/**
 * Pretty-print a JSON string. Returns the original string if parsing fails.
 */
export function formatJson(raw: string, indent = 2): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, indent);
  } catch {
    return raw;
  }
}

/**
 * Simple XML indentation formatter.
 * Handles basic XML structures — not a full parser.
 */
export function formatXml(raw: string, indent = 2): string {
  const pad = ' '.repeat(indent);
  let depth = 0;
  const lines: string[] = [];

  // Split on tags while preserving them
  const tokens = raw.replace(/>\s*</g, '>\n<').split('\n');

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    // Self-closing or processing instruction
    if (trimmed.startsWith('<?') || trimmed.match(/^<\w[^>]*\/>$/)) {
      lines.push(pad.repeat(depth) + trimmed);
    }
    // Closing tag
    else if (trimmed.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      lines.push(pad.repeat(depth) + trimmed);
    }
    // Opening tag (not self-closing)
    else if (trimmed.startsWith('<') && !trimmed.startsWith('<!')) {
      lines.push(pad.repeat(depth) + trimmed);
      // Only increase depth if it's not a tag with inline content like <tag>value</tag>
      if (!trimmed.match(/<[^/][^>]*>.*<\/[^>]+>$/)) {
        depth++;
      }
    }
    // Text content or other
    else {
      lines.push(pad.repeat(depth) + trimmed);
    }
  }

  return lines.join('\n');
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, i);
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[i]}`;
}

/**
 * Format milliseconds into a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
