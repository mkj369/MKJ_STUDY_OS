import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '@/i18n';
import { NAV_ITEMS } from '@/app/nav';

/**
 * The Bangla dictionary is typed as the same key set, but TypeScript cannot see
 * that a translator added a key to English only at runtime if the object is
 * ever built dynamically. This keeps the two languages honest.
 */
describe('translation dictionaries', () => {
  const en = DICTIONARIES.en;
  const bn = DICTIONARIES.bn;

  it('has the same keys in both languages', () => {
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings', () => {
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe('');
    for (const [key, value] of Object.entries(bn)) expect(value.trim(), key).not.toBe('');
  });

  it('translates the Bangla navigation into Bengali script', () => {
    for (const item of NAV_ITEMS) {
      const label = bn[item.labelKey];
      expect(label, item.labelKey).toMatch(/[\u0980-\u09FF]/);
    }
  });

  it('covers every navigation label', () => {
    for (const item of NAV_ITEMS) {
      expect(en[item.labelKey], item.labelKey).toBeTruthy();
      expect(bn[item.labelKey], item.labelKey).toBeTruthy();
    }
  });
});
