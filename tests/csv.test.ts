import { describe, expect, it } from 'vitest';
import { toCsv } from '@/utils/csv';

describe('CSV export', () => {
  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv([{ title: 'a,b', body: 'say "hi"\nthen go', minutes: 30 }]);
    expect(csv.split('\n')[0]).toBe('title,body,minutes');
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi""');
  });

  it('flattens arrays and nested objects instead of losing them', () => {
    const csv = toCsv([{ tags: ['physics', 'mechanics'], meta: { level: 'HSC' } }]);
    expect(csv).toContain('physics | mechanics');
    expect(csv).toContain('{""level"":""HSC""}');
  });

  it('neutralises spreadsheet formulas from user text', () => {
    const csv = toCsv([{ title: '=HYPERLINK("http://evil","click")' }, { title: '@SUM(A1)' }]);
    expect(csv).not.toContain('\n=HYPERLINK');
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain("'@SUM(A1)");
  });

  it('keeps negative numbers numeric', () => {
    const csv = toCsv([{ delta: -12 }]);
    expect(csv.split('\n')[1]).toBe('-12');
  });
});
