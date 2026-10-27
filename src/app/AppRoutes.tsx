import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CurriculumPage } from '@/features/curriculum/CurriculumPage';
import { SubjectsPage } from '@/features/subjects/SubjectsPage';
import { ChapterDetailPage } from '@/features/subjects/ChapterDetailPage';
import { LecturesPage } from '@/features/lectures/LecturesPage';
import { SessionsPage } from '@/features/sessions/SessionsPage';
import { RevisionsPage } from '@/features/revisions/RevisionsPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { DifficultiesPage } from '@/features/difficulties/DifficultiesPage';
import { MistakesPage } from '@/features/mistakes/MistakesPage';
import { ExamsPage } from '@/features/exams/ExamsPage';
import { NotesPage } from '@/features/notes/NotesPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { RemindersPage } from '@/features/reminders/RemindersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { NotFoundPage } from '@/features/shared/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="curriculum" element={<CurriculumPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="subjects/:subjectId" element={<SubjectsPage />} />
        <Route path="chapters/:chapterId" element={<ChapterDetailPage />} />
        <Route path="lectures" element={<LecturesPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="revisions" element={<RevisionsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="difficulties" element={<DifficultiesPage />} />
        <Route path="mistakes" element={<MistakesPage />} />
        <Route path="exams" element={<ExamsPage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
