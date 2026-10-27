import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/Page';

/**
 * Unknown route. Every other screen renders a single `<h1>` inside `<main>`
 * (the accessibility sweep asserts exactly that), so this page does too —
 * previously its only heading was an `<h2>` supplied by `SectionCard`.
 */
export function NotFoundPage() {
  return (
    <div className="dash">
      <header className="hero">
        <div className="hero__body">
          <h1>Page not found</h1>
          <div className="hero__meta">
            <span className="tiny muted">
              That address does not exist in MKJ StudyOS. Nothing was changed, and no record was
              interpreted.
            </span>
          </div>
        </div>
      </header>
      <section className="card" aria-label="Recovery">
        <EmptyState
          title="Nothing was lost"
          message="Your records are untouched. Use the link below to return to the dashboard, or pick a screen from the navigation."
          action={
            <Link to="/" className="btn btn--primary btn--sm">
              Back to dashboard
            </Link>
          }
        />
      </section>
    </div>
  );
}
