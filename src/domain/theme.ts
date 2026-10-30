/**
 * Appearance: per-student theme presets.
 *
 * The palette lives here as data and reaches the DOM only as CSS custom
 * properties. Nothing in the app reads a hex value directly, so changing theme
 * repaints every screen — forms, charts, progress bars, dialogs — because they
 * all resolve the same tokens.
 *
 * Sky Blue is the default. Green is one of ten presets, not the identity.
 */

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export interface ThemePreset {
  key: string;
  label: string;
  /** Accent used for primary buttons, progress and selected states. */
  accent: string;
  /** Hover/darker step of the same hue. */
  accentStrong: string;
  /** Tinted background for chips, selected nav and soft highlights. */
  accentSoft: string;
  /** Optional second hue used in gradients only. */
  partner: string;
  /** Swatch shown in the picker. */
  swatch: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'sky',
    label: 'Sky Blue',
    accent: '#38BDF8',
    accentStrong: '#0EA5E9',
    accentSoft: '#E0F2FE',
    partner: '#2563EB',
    swatch: '#38BDF8',
  },
  {
    key: 'ocean',
    label: 'Ocean Blue',
    accent: '#2563EB',
    accentStrong: '#1D4ED8',
    accentSoft: '#DBEAFE',
    partner: '#0EA5E9',
    swatch: '#2563EB',
  },
  {
    key: 'violet',
    label: 'Violet',
    /*
     * #8B5CF6 sits at 4.42:1 with its best text colour — just under AA for small
     * text. Two units in the red channel (visually identical) clear 4.5:1, so the
     * label on a violet button is readable without changing the hue.
     */
    accent: '#8A50F5',
    accentStrong: '#7C3AED',
    accentSoft: '#EDE9FE',
    partner: '#6366F1',
    swatch: '#8A50F5',
  },
  {
    key: 'lavender',
    label: 'Lavender',
    accent: '#A78BFA',
    accentStrong: '#8B5CF6',
    accentSoft: '#F3E8FF',
    partner: '#C084FC',
    swatch: '#A78BFA',
  },
  {
    key: 'emerald',
    label: 'Emerald',
    accent: '#10B981',
    accentStrong: '#059669',
    accentSoft: '#D1FAE5',
    partner: '#22C55E',
    swatch: '#10B981',
  },
  {
    key: 'teal',
    label: 'Teal',
    accent: '#14B8A6',
    accentStrong: '#0D9488',
    accentSoft: '#CCFBF1',
    partner: '#06B6D4',
    swatch: '#14B8A6',
  },
  {
    key: 'rose',
    label: 'Rose Pink',
    accent: '#F43F5E',
    accentStrong: '#E11D48',
    accentSoft: '#FFE4E6',
    partner: '#EC4899',
    swatch: '#F43F5E',
  },
  {
    key: 'sunset',
    label: 'Sunset Orange',
    accent: '#F97316',
    accentStrong: '#EA580C',
    accentSoft: '#FFEDD5',
    partner: '#FB923C',
    swatch: '#F97316',
  },
  {
    key: 'amber',
    label: 'Amber',
    accent: '#F59E0B',
    accentStrong: '#D97706',
    accentSoft: '#FEF3C7',
    partner: '#FBBF24',
    swatch: '#F59E0B',
  },
  {
    key: 'graphite',
    label: 'Graphite',
    accent: '#475569',
    accentStrong: '#334155',
    accentSoft: '#E2E8F0',
    partner: '#64748B',
    swatch: '#475569',
  },
];

export const DEFAULT_THEME_PRESET = 'sky';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

export interface ThemePreference {
  mode: ThemeMode;
  preset: string;
  /** Optional custom accent that overrides the preset's accent. */
  accent: string | null;
}

export const DEFAULT_THEME: ThemePreference = {
  mode: DEFAULT_THEME_MODE,
  preset: DEFAULT_THEME_PRESET,
  accent: null,
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

const SKY_PRESET = THEME_PRESETS[0] as ThemePreset;

export function findPreset(key: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.key === key) ?? SKY_PRESET;
}

/**
 * Coerce whatever is in storage into something usable. A renamed or removed
 * preset must not leave the app unstyled, so unknown values fall back to the
 * default rather than being applied.
 */
export function normaliseTheme(value: Partial<ThemePreference> | null | undefined): ThemePreference {
  if (!value) return { ...DEFAULT_THEME };
  return {
    mode: isThemeMode(value.mode) ? value.mode : DEFAULT_THEME.mode,
    preset: THEME_PRESETS.some((preset) => preset.key === value.preset) ? (value.preset as string) : DEFAULT_THEME.preset,
    accent: isHexColor(value.accent) ? normaliseHex(value.accent) : null,
  };
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normaliseHex(value: string): string {
  return value.toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Colour maths — only used to derive hover/shade steps from a custom accent.  */
/* -------------------------------------------------------------------------- */

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix two colours; `weight` is how much of `a` survives (0–1). */
export function mixHex(a: string, b: string, weight: number): string {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(
    first.r * w + second.r * (1 - w),
    first.g * w + second.g * (1 - w),
    first.b * w + second.b * (1 - w),
  );
}

/** Relative luminance (WCAG) of a hex colour. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Text colour to place on top of an accent fill.
 *
 * Several presets (amber, lavender, sky) are light enough that white text fails
 * contrast. Rather than hand-pick a label colour per preset and hope, measure and
 * choose the better of near-black and white.
 */
export function readableOn(background: string): '#0B1220' | '#FFFFFF' | '#000000' {
  const options: ('#0B1220' | '#FFFFFF')[] = ['#FFFFFF', '#0B1220'];
  const best = options.reduce((chosen, candidate) =>
    contrastRatio(background, candidate) > contrastRatio(background, chosen) ? candidate : chosen,
  );
  /*
   * Some fills sit in the middle: #6366F1 gives white 4.47:1 and near-black
   * 4.19:1, so neither of the two house colours clears AA. Pure white or pure
   * black always will, and a label at 4.5:1 matters more than an off-black.
   */
  if (contrastRatio(background, best) >= 4.5) return best;
  // #000000 clears AA where #0B1220 does not (a violet #6366F1 fill), and it is
  // the honest answer: a label has to be readable, not merely on-brand.
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

/**
 * The CSS custom properties for a preference. Returned as a plain object so the
 * applies can be one `style.setProperty` loop and the values can be asserted in
 * a unit test without a DOM.
 */
/**
 * A version of the accent that can carry text.
 *
 * The accent itself is a *fill* colour: Sky Blue at 2.4:1 on white is fine
 * behind a dark label and unreadable as the label. Every screen that used the
 * accent for links, badges or card titles therefore failed AA. This darkens
 * (light mode) or lightens (dark mode) the same hue until it clears 4.5:1
 * against the surface it sits on, so text keeps the identity without losing
 * contrast.
 */
export function accentInk(accent: string, mode: 'light' | 'dark', surface?: string): string {
  /*
   * Two surfaces matter: the page and the accent's own soft tint (chips,
   * selected nav rows, demo badges). The tint is the darker of the two, so an
   * ink that clears it clears the page as well.
   */
  const softDefault = mode === 'dark' ? '#10293C' : mixHex(accent, '#FFFFFF', 0.16);
  const targets = [mode === 'dark' ? '#0B1220' : '#FFFFFF', surface ?? softDefault];
  const towards = mode === 'dark' ? '#FFFFFF' : '#000000';
  for (let step = 0; step <= 20; step += 1) {
    const ink = step === 0 ? accent : mixHex(accent, towards, 1 - step * 0.05);
    if (targets.every((target) => contrastRatio(ink, target) >= 4.6)) return ink;
  }
  return mixHex(accent, towards, 0);
}

function lighterOf(a: string, b: string): string {
  return relativeLuminance(a) >= relativeLuminance(b) ? a : b;
}

export function themeVariables(
  preference: ThemePreference,
  mode?: 'light' | 'dark',
): Record<string, string> {
  const preset = findPreset(preference.preset);
  const resolved = mode ?? resolveMode(preference.mode, false);
  const accent = preference.accent ? normaliseHex(preference.accent) : preset.accent;
  // A custom accent keeps the preset's relationships: a darker step for hover
  // and a very light tint for soft backgrounds.
  /*
   * Mode-aware steps. The presets store light-mode tints; painting those onto a
   * dark page produced pale blue chips with white text (1.15:1). In dark mode the
   * tint is mixed towards the page instead, and the "strong" step moves lighter
   * so hover still reads as a step *up*.
   */
  const dark = resolved === 'dark';
  /*
   * The "strong" step is the darker end of every gradient, in both schemes.
   * It used to lighten in dark mode, which turned the primary button into a
   * pale violet slab with a white label at 2.9:1 — a fill may get brighter on
   * hover, but it must not get brighter than the text colour can survive.
   */
  const strong = preference.accent ? mixHex(preference.accent, '#000000', 0.82) : preset.accentStrong;
  const partner = preference.accent ? mixHex(preference.accent, '#3B82F6', 0.6) : preset.partner;
  const soft = dark
    ? mixHex(accent, '#0B1220', 0.16)
    : preference.accent
      ? mixHex(preference.accent, '#FFFFFF', 0.16)
      : preset.accentSoft;

  return {
    '--accent': accent,
    '--accent-strong': strong,
    '--accent-ink': accentInk(accent, resolved, soft),
    '--accent-soft': soft,
    '--accent-partner': partner,
    /*
     * Label colours are decided against the *lightest* stop of the gradient the
     * label actually sits on — measuring only `accent` put a white label on
     * #A78BFA at 4.47:1. Two tokens because there are two gradients: the button
     * fill (accent → strong) and the brand/subject mark (accent → partner).
     */
    '--accent-contrast': readableOn(lighterOf(accent, strong)),
    '--mark-contrast': readableOn(lighterOf(accent, partner)),
    '--accent-rgb': (() => {
      const { r, g, b } = hexToRgb(accent);
      return `${r}, ${g}, ${b}`;
    })(),
  };
}

/** What the student actually sees under them right now. */
export function resolveMode(mode: ThemeMode, systemPrefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}
