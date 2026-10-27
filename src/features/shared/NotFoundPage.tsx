import { Link } from 'react-router-dom';
import { SectionCard } from '@/components/ui/Page';

export function NotFoundPage() {
  return (
    <SectionCard title="Page not found">
      <p className="small muted">
        That address does not exist in MKJ StudyOS. Nothing was changed, and no record was interpreted.
      </p>
      <div style={{ height: 12 }} />
      <Link to="/" className="btn btn--primary btn--sm">
        Back to dashboard
      </Link>
    </SectionCard>
  );
}
