// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from '@/i18n';

function Switcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="label">{t('nav.dashboard')}</span>
      <button type="button" onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}>
        switch
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
});

describe('locale switching', () => {
  it('translates the UI and updates the document language', async () => {
    render(
      <I18nProvider>
        <Switcher />
      </I18nProvider>,
    );
    expect(screen.getByTestId('label')).toHaveTextContent('Dashboard');
    expect(document.documentElement.lang).toBe('en');

    await userEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(screen.getByTestId('locale')).toHaveTextContent('bn');
    expect(screen.getByTestId('label')).toHaveTextContent('ড্যাশবোর্ড');
    expect(document.documentElement.lang).toBe('bn');
    expect(window.localStorage.getItem('mkj.studyos.locale')).toBe('bn');
  });
});
