import { useTheme } from '@/app/ThemeProvider';
import { THEME_MODES, THEME_PRESETS, DEFAULT_THEME, type ThemeMode } from '@/domain/theme';

/**
 * Appearance.
 *
 * Eleven palettes and three modes, applied live. The preview underneath is not a
 * mock-up image — it is real elements resolving the real tokens, so what the
 * student sees here is exactly what the app will look like.
 */
const MODE_LABELS: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function AppearanceSection() {
  const { theme, setTheme, resetTheme } = useTheme();

  const isDefault = theme.mode === DEFAULT_THEME.mode && theme.preset === DEFAULT_THEME.preset && !theme.accent;

  return (
    <section className="card" id="appearance">
      <div className="card__header">
        <div>
          <h2 className="card__title">Appearance</h2>
          <p className="card__hint">Applies to every screen, and only to your account.</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void resetTheme()} disabled={isDefault}>
          Reset
        </button>
      </div>

      <div className="stack">
        <div className="field">
          <span className="field__label">Mode</span>
          <div className="segmented" role="radiogroup" aria-label="Colour mode">
            {THEME_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={theme.mode === mode}
                className={`segmented__item${theme.mode === mode ? ' segmented__item--active' : ''}`}
                onClick={() => void setTheme({ ...theme, mode })}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Colour</span>
          <div className="preset-grid" role="radiogroup" aria-label="Colour preset">
            {THEME_PRESETS.map((preset) => {
              const active = theme.preset === preset.key && !theme.accent;
              return (
                <button
                  key={preset.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={preset.label}
                  className={`preset-card${active ? ' preset-card--active' : ''}`}
                  onClick={() => void setTheme({ ...theme, preset: preset.key, accent: null })}
                >
                  <span className="preset-card__swatch" style={{ background: preset.swatch }} aria-hidden="true" />
                  <span className="preset-card__label">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="custom-accent">
            Custom accent <span className="field__optional">optional</span>
          </label>
          <div className="row">
            <input
              id="custom-accent"
              type="color"
              className="input"
              style={{ width: 56, minHeight: 44, padding: 4, cursor: 'pointer' }}
              value={theme.accent ?? '#38BDF8'}
              onChange={(event) => void setTheme({ ...theme, accent: event.target.value })}
              aria-label="Pick a custom accent colour"
            />
            <span className="tiny muted">
              {theme.accent ? `Using ${theme.accent}` : 'Using the preset colour'}
            </span>
            {theme.accent ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void setTheme({ ...theme, accent: null })}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <span className="field__label" style={{ display: 'block', marginBottom: 6 }}>
            Preview
          </span>
          <div className="theme-preview" aria-hidden="true">
            <div className="theme-preview__surface">
              <span className="subject-card__mark" style={{ width: 34, height: 34, fontSize: '0.75rem' }}>
                PH
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small strong">Physics · 2nd Paper</div>
                <div className="progress" style={{ marginTop: 6 }}>
                  <div className="progress__bar" style={{ width: '62%' }} />
                </div>
              </div>
              <span className="btn btn--primary btn--sm">Add</span>
            </div>
            <div className="row">
              <span className="chip chip--active">Chapter 4</span>
              <span className="badge badge--good">Done</span>
              <span className="badge badge--warn">Review</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
