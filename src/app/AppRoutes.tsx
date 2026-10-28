import { lazy, Suspense, type ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/ui/States';

/**
 * Route-based code splitting: every page is a separate chunk, so the first
 * paint only downloads the shell plus the page you asked for. A named export
 * is mapped to the default export that React.lazy expects.
 */
function lazyPage<T extends Record<string, unknown>, K extends keyof T>(loader: () => Promise<T>, name: K) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[name] as ComponentType };
  });
}

const DashboardPage = lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const CurriculumPage = lazyPage(() => import('@/features/curriculum/CurriculumPage'), 'CurriculumPage');
const SubjectsPage = lazyPage(() => import('@/features/subjects/SubjectsPage'), 'SubjectsPage');
const ChapterDetailPage = lazyPage(() => import('@/features/subjects/ChapterDetailPage'), 'ChapterDetailPage');
const LecturesPage = lazyPage(() => import('@/features/lectures/LecturesPage'), 'LecturesPage');
const SessionsPage = lazyPage(() => import('@/features/sessions/SessionsPage'), 'SessionsPage');
const RevisionsPage = lazyPage(() => import('@/features/revisions/RevisionsPage'), 'RevisionsPage');
const TasksPage = lazyPage(() => import('@/features/tasks/TasksPage'), 'TasksPage');
const DifficultiesPage = lazyPage(() => import('@/features/difficulties/DifficultiesPage'), 'DifficultiesPage');
const MistakesPage = lazyPage(() => import('@/features/mistakes/MistakesPage'), 'MistakesPage');
const ExamsPage = lazyPage(() => import('@/features/exams/ExamsPage'), 'ExamsPage');
const NotesPage = lazyPage(() => import('@/features/notes/NotesPage'), 'NotesPage');
const ReportsPage = lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const RemindersPage = lazyPage(() => import('@/features/reminders/RemindersPage'), 'RemindersPage');
const SettingsPage = lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const NotFoundPage = lazyPage(() => import('@/features/shared/NotFoundPage'), 'NotFoundPage');

const SyllabusPage = lazyPage(() => import('@/features/syllabus/SyllabusPage'), 'SyllabusPage');
const TimeTrackerPage = lazyPage(() => import('@/features/time/TimeTrackerPage'), 'TimeTrackerPage');
const PlannerPage = lazyPage(() => import('@/features/planner/PlannerPage'), 'PlannerPage');
const SmartRevisionPage = lazyPage(() => import('@/features/revisions/SmartRevisionPage'), 'SmartRevisionPage');
const WeaknessPage = lazyPage(() => import('@/features/mistakes/WeaknessPage'), 'WeaknessPage');
const PreparationPage = lazyPage(() => import('@/features/exams/PreparationPage'), 'PreparationPage');
const PracticePage = lazyPage(() => import('@/features/practice/PracticePage'), 'PracticePage');
const VaultPage = lazyPage(() => import('@/features/notes/VaultPage'), 'VaultPage');
const InsightsPage = lazyPage(() => import('@/features/insights/InsightsPage'), 'InsightsPage');
const FocusPage = lazyPage(() => import('@/features/focus/FocusPage'), 'FocusPage');
const ExportPage = lazyPage(() => import('@/features/export/ExportPage'), 'ExportPage');

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState label="Opening this screen…" />}>
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
          <Route path="revisions/smart" element={<SmartRevisionPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="difficulties" element={<DifficultiesPage />} />
          <Route path="mistakes" element={<MistakesPage />} />
          <Route path="exams" element={<ExamsPage />} />
          <Route path="exams/prep" element={<PreparationPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reminders" element={<RemindersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="syllabus" element={<SyllabusPage />} />
          <Route path="time" element={<TimeTrackerPage />} />
          <Route path="planner" element={<PlannerPage />} />
          <Route path="weakness" element={<WeaknessPage />} />
          <Route path="practice" element={<PracticePage />} />
          <Route path="vault" element={<VaultPage />} />
          <Route path="focus" element={<FocusPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
