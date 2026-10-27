/**
 * CSV export helper.
 *
 * Two rules matter here:
 *  1. Round-trip correctness: quotes, commas, newlines and nested values.
 *  2. Formula injection: a spreadsheet treats a cell starting with `=`, `+`, `-` or
 *     `@` as a formula. A note titled `=HYPERLINK(...)` must not execute in Excel,
 *     so such strings are prefixed with an apostrophe. Numbers stay numeric.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = Array.isArray(value)
      ? value.join(' | ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    const safe =
      typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /["\n\r,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
}
