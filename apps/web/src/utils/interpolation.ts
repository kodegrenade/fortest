export function interpolate(text: string, vars: Record<string, string>): string {
  if (!text) return text;
  
  // Replace {{KEY}} with the value of KEY from vars.
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    if (vars.hasOwnProperty(trimmedKey)) {
      return vars[trimmedKey] || '';
    }
    return match; // Leave untouched if no variable found
  });
}
