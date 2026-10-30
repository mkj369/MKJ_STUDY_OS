import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_MODES,
  THEME_PRESETS,
  contrastRatio,
  findPreset,
  hexToRgb,
  isHexColor,
  isThemeMode,
  mixHex,
  normaliseTheme,
  readableOn,
  relativeLuminance,
  resolveMode,
  themeVariables,
} from '@/domain/theme';

describe('theme presets', () => {
  it('ships ten presets with Sky Blue first and as the default', () => {
    expect(THEME_PRESETS).toHaveLength(10);
    expect(THEME_PRESETS[0]?.key).toBe('sky');
    expect(THEME_PRESETS[0]?.label).toBe('Sky Blue');
    expect(DEFAULT_THEME.preset).toBe('sky');
    expect(DEFAULT_THEME.accent).toBeNull();
  });

  it('gives each preset a unique key and usable colours', () => {
    const keys = THEME_PRESETS.map((preset) => preset.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const preset of THEME_PRESETS) {
      expect(isHexColor(preset.accent)).toBe(true);
      expect(isHexColor(preset.accentStrong)).toBe(true);
      expect(isHexColor(preset.accentSoft)).toBe(true);
      expect(isHexColor(preset.swatch)).toBe(true);
    }
  });

  it('keeps readable text on every accent fill', () => {
    for (const preset of THEME_PRESETS) {
      const onAccent = readableOn(preset.accent);
      expect(contrastRatio(preset.accent, onAccent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('falls back to Sky Blue for unknown or missing keys', () => {
    expect(findPreset('does-not-exist').key).toBe('sky');
    expect(findPreset(null).key).toBe('sky');
    expect(findPreset('rose').key).toBe('rose');
  });

  it('validates theme modes', () => {
    expect([...THEME_MODES]).toEqual(['light', 'dark', 'system']);
    for (const mode of THEME_MODES) expect(isThemeMode(mode)).toBe(true);
    expect(isThemeMode('sepia')).toBe(false);
    expect(isThemeMode(undefined)).toBe(false);
  });
});

describe('normaliseTheme', () => {
  it('returns the default for empty storage', () => {
    expect(normaliseTheme(null)).toEqual(DEFAULT_THEME);
    expect(normaliseTheme(undefined)).toEqual(DEFAULT_THEME);
  });

  it('keeps a valid saved preference', () => {
    expect(normaliseTheme({ mode: 'dark', preset: 'rose', accent: '#FF00AA' })).toEqual({
      mode: 'dark',
      preset: 'rose',
      accent: '#ff00aa',
    });
  });

  it('repairs a removed preset instead of leaving the app unstyled', () => {
    expect(normaliseTheme({ mode: 'light', preset: 'retired-preset' }).preset).toBe('sky');
  });

  it('drops an invalid custom accent', () => {
    expect(normaliseTheme({ mode: 'light', preset: 'sky', accent: 'blue' }).accent).toBeNull();
    expect(normaliseTheme({ mode: 'light', preset: 'sky', accent: '#12345' }).accent).toBeNull();
  });

  it('is idempotent', () => {
    const once = normaliseTheme({ mode: 'system', preset: 'emerald', accent: '#22C55E' });
    expect(normaliseTheme(once)).toEqual(once);
  });
});

describe('themeVariables', () => {
  it('emits the accent tokens from the preset', () => {
    const vars = themeVariables({ mode: 'light', preset: 'sky', accent: null });
    expect(vars['--accent']).toBe('#38BDF8');
    expect(vars['--accent-strong']).toBe('#0EA5E9');
    expect(vars['--accent-rgb']).toBe('56, 189, 248');
    expect(vars['--accent-contrast']).toMatch(/^#(FFFFFF|0B1220)$/);
  });

  it('keeps text on the accent readable in both schemes', () => {
    /*
     * The accent is a fill colour. Sky Blue on white is 2.4:1, which is why links
     * and card titles used to fail AA; --accent-ink is the same hue darkened (or
     * lightened in dark mode) until text clears 4.5:1 on the page and on its own
     * soft tint.
     */
    for (const preset of THEME_PRESETS) {
      const light = themeVariables({ mode: 'light', preset: preset.key, accent: null }, 'light');
      expect(contrastRatio(light['--accent-ink'] as string, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light['--accent-ink'] as string, light['--accent-soft'] as string)).toBeGreaterThanOrEqual(4.5);

      const dark = themeVariables({ mode: 'dark', preset: preset.key, accent: null }, 'dark');
      expect(contrastRatio(dark['--accent-ink'] as string, '#0B1220')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark['--accent-ink'] as string, dark['--accent-soft'] as string)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('mixes the dark tint towards the page, not towards white', () => {
    const light = themeVariables({ mode: 'light', preset: 'sky', accent: null }, 'light');
    const dark = themeVariables({ mode: 'dark', preset: 'sky', accent: null }, 'dark');
    // A light-mode tint painted onto a dark page was the 1.15:1 bug.
    expect(relativeLuminance(dark['--accent-soft'] as string)).toBeLessThan(0.2);
    expect(relativeLuminance(dark['--accent-soft'] as string)).toBeLessThan(
      relativeLuminance(light['--accent-soft'] as string),
    );
    // The strong step is the darker end of the fill gradient in both schemes,
    // so the primary button's label is decided against the lighter end.
    expect(relativeLuminance(dark['--accent-strong'] as string)).toBeLessThan(
      relativeLuminance(dark['--accent'] as string),
    );
    for (const mode of ['light', 'dark'] as const) {
      const vars = themeVariables({ mode, preset: 'violet', accent: null }, mode);
      const label = vars['--accent-contrast'] as string;
      const lighter = relativeLuminance(vars['--accent'] as string) >= relativeLuminance(vars['--accent-strong'] as string)
        ? (vars['--accent'] as string)
        : (vars['--accent-strong'] as string);
      expect(contrastRatio(label, lighter)).toBeGreaterThanOrEqual(4.4);
    }
  });

  it('derives hover and soft steps from a custom accent', () => {
    const vars = themeVariables({ mode: 'light', preset: 'sky', accent: '#8B5CF6' });
    expect(vars['--accent']).toBe('#8b5cf6');
    // The custom hover step must be darker than the accent, and the soft tint lighter.
    expect(relativeLuminance(vars['--accent-strong'] as string)).toBeLessThan(relativeLuminance('#8b5cf6'));
    expect(relativeLuminance(vars['--accent-soft'] as string)).toBeGreaterThan(relativeLuminance('#8b5cf6'));
    expect(vars['--accent-rgb']).toBe('139, 92, 246');
  });

  it('resolves system mode from the OS preference', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });
});

describe('colour maths', () => {
  it('converts hex to rgb and back', () => {
    expect(hexToRgb('#38BDF8')).toEqual({ r: 56, g: 189, b: 248 });
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#000000');
  });
});
