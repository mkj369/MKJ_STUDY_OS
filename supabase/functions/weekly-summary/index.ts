/**
 * weekly-summary Edge Function
 *
 * Request flow: authenticated app -> this function -> provider API.
 * The provider key never leaves the server. Only the bounded records for the
 * requested week are sent to the model, never the whole database.
 *
 * Body:
 *   { action: "status" }
 *   { action: "generate", week_start: "YYYY-MM-DD", week_end: "YYYY-MM-DD",
 *     timezone: "Asia/Dhaka", locale: "en" }
 *
 * Responses are validated JSON; anything malformed or containing invented
 * numbers is rejected (422) and nothing is stored.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  generateWeeklyNarrative,
  providerConfig,
  type WeeklyFacts,
} from '../_shared/ai.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DISCLAIMER =
  'AI interprets only the records you entered for this week. Missing records mean "not recorded", not "not studied". This is not an official assessment and does not predict exam results.';

interface Body {
  action?: string;
  week_start?: string;
  week_end?: string;
  timezone?: string;
  locale?: string;
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dayAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function maxPerHour(): number {
  const value = Number(Deno.env.get('AI_MAX_REQUESTS_PER_HOUR') ?? '20');
  return Number.isFinite(value) && value > 0 ? value : 20;
}

function subjectLabel(subject: {
  custom_name?: string | null;
  custom_paper_label?: string | null;
  curriculum_subject?: { name?: string | null; paper_label?: string | null } | null;
} | null | undefined): string {
  if (!subject) return 'Unknown subject';
  if (subject.custom_name) {
    return subject.custom_paper_label ? `${subject.custom_name} (${subject.custom_paper_label})` : subject.custom_name;
  }
  const name = subject.curriculum_subject?.name ?? 'Subject';
  const paper = subject.curriculum_subject?.paper_label;
  return paper ? `${name} — ${paper}` : name;
}

async function buildFacts(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  weekEnd: string,
  timezone: string,
  locale: string,
): Promise<WeeklyFacts> {
  const startTs = `${weekStart}T00:00:00Z`;
  const endTs = `${dayAfter(weekEnd)}T00:00:00Z`;
  const prevStart = `${dayBefore(weekStart).slice(0, 8)}${weekStart.slice(8)}`;

  const [subjectsRes, sessionsRes, lecturesRes, revisionsRes, tasksRes, difficultiesRes, examsRes, checklistRes, prevSessionsRes] =
    await Promise.all([
      supabase
        .from('user_subjects')
        .select('id, custom_name, custom_paper_label, status, curriculum_subject:curriculum_subjects(name, paper_label)')
        .eq('status', 'active')
        .limit(30),
      supabase
        .from('study_sessions')
        .select('session_date, user_subject_id, activity_type, duration_minutes, result')
        .gte('session_date', weekStart)
        .lte('session_date', weekEnd)
        .limit(60),
      supabase
        .from('lecture_records')
        .select('lecture_date, user_subject_id, title, source, is_completed')
        .gte('lecture_date', weekStart)
        .lte('lecture_date', weekEnd)
        .limit(40),
      supabase
        .from('revision_sessions')
        .select('revised_at, user_subject_id, user_chapter_id, method, confidence_rating, questions_attempted, questions_correct')
        .gte('revised_at', weekStart)
        .lte('revised_at', weekEnd)
        .limit(30),
      supabase
        .from('study_tasks')
        .select('title, status, priority, due_date, estimated_minutes, completed_at, user_subject_id')
        .or(`due_date.gte.${weekStart},completed_at.gte.${startTs}`)
        .limit(50),
      supabase
        .from('topic_difficulties')
        .select('topic_name, user_subject_id, severity, status, created_at')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('exam_results')
        .select('exam_name, exam_date, user_subject_id, marks_obtained, total_marks')
        .gte('exam_date', weekStart)
        .lte('exam_date', weekEnd)
        .limit(20),
      supabase
        .from('chapter_checklist_progress')
        .select('completed_at, checklist_item_id')
        .eq('is_done', true)
        .gte('completed_at', startTs)
        .lt('completed_at', endTs)
        .limit(60),
      supabase
        .from('study_sessions')
        .select('duration_minutes')
        .gte('session_date', prevStart)
        .lt('session_date', weekStart)
        .limit(100),
    ]);

  const subjects = subjectsRes.data ?? [];
  const subjectName = new Map<string, string>();
  for (const subject of subjects) {
    subjectName.set(subject.id as string, subjectLabel(subject as never));
  }

  const sessions = (sessionsRes.data ?? []).map((row) => ({
    date: row.session_date as string,
    subject: subjectName.get(row.user_subject_id as string) ?? 'Unknown subject',
    activity: row.activity_type as string,
    minutes: Number(row.duration_minutes),
    result: (row.result as string | null) ?? null,
  }));

  const lectures = (lecturesRes.data ?? []).map((row) => ({
    date: row.lecture_date as string,
    subject: subjectName.get(row.user_subject_id as string) ?? 'Unknown subject',
    title: String(row.title).slice(0, 120),
    source: row.source as string,
    completed: Boolean(row.is_completed),
  }));

  // Chapter labels for revisions and checklist items (bounded lookups).
  const chapterIds = [...new Set((revisionsRes.data ?? []).map((r) => r.user_chapter_id).filter(Boolean))] as string[];
  const chapterTitles = new Map<string, string>();
  if (chapterIds.length > 0) {
    const { data: chapters } = await supabase
      .from('user_chapters')
      .select('id, custom_title, curriculum_chapter_id')
      .in('id', chapterIds.slice(0, 30));
    const curriculumIds = (chapters ?? []).map((c) => c.curriculum_chapter_id).filter(Boolean) as string[];
    const curriculumTitles = new Map<string, string>();
    if (curriculumIds.length > 0) {
      const { data: curriculumChapters } = await supabase
        .from('curriculum_chapters')
        .select('id, title')
        .in('id', curriculumIds.slice(0, 30));
      for (const chapter of curriculumChapters ?? []) curriculumTitles.set(chapter.id as string, chapter.title as string);
    }
    for (const chapter of chapters ?? []) {
      chapterTitles.set(
        chapter.id as string,
        (chapter.custom_title as string | null) ??
          curriculumTitles.get(chapter.curriculum_chapter_id as string) ??
          'Chapter',
      );
    }
  }

  const revisions = (revisionsRes.data ?? []).map((row) => ({
    date: row.revised_at as string,
    subject: subjectName.get(row.user_subject_id as string) ?? 'Unknown subject',
    chapter: row.user_chapter_id ? chapterTitles.get(row.user_chapter_id as string) ?? null : null,
    method: row.method as string,
    confidence: Number(row.confidence_rating),
    questions_attempted: row.questions_attempted === null ? null : Number(row.questions_attempted),
    questions_correct: row.questions_correct === null ? null : Number(row.questions_correct),
  }));

  const checklistRaw = checklistRes.data ?? [];
  const itemIds = [...new Set(checklistRaw.map((row) => row.checklist_item_id as string))];
  const itemLabels = new Map<string, { label: string; chapterId: string }>();
  if (itemIds.length > 0) {
    const { data: items } = await supabase
      .from('chapter_checklist_items')
      .select('id, label, user_chapter_id')
      .in('id', itemIds.slice(0, 60));
    const itemChapterIds = [...new Set((items ?? []).map((item) => item.user_chapter_id as string))];
    const chapterLabels = new Map<string, string>();
    if (itemChapterIds.length > 0) {
      const { data: chapters } = await supabase
        .from('user_chapters')
        .select('id, custom_title, curriculum_chapter_id')
        .in('id', itemChapterIds.slice(0, 60));
      const curriculumIds = (chapters ?? []).map((c) => c.curriculum_chapter_id).filter(Boolean) as string[];
      const curriculumTitles = new Map<string, string>();
      if (curriculumIds.length > 0) {
        const { data: curriculumChapters } = await supabase
          .from('curriculum_chapters')
          .select('id, title')
          .in('id', curriculumIds.slice(0, 60));
        for (const chapter of curriculumChapters ?? []) curriculumTitles.set(chapter.id as string, chapter.title as string);
      }
      for (const chapter of chapters ?? []) {
        chapterLabels.set(
          chapter.id as string,
          (chapter.custom_title as string | null) ??
            curriculumTitles.get(chapter.curriculum_chapter_id as string) ??
            'Chapter',
        );
      }
    }
    for (const item of items ?? []) {
      itemLabels.set(item.id as string, {
        label: String(item.label).slice(0, 80),
        chapterId: item.user_chapter_id as string,
      });
    }
    for (const [id, value] of itemLabels) {
      itemLabels.set(id, { label: value.label, chapterId: chapterLabels.get(value.chapterId) ?? 'Chapter' });
    }
  }

  const checklist = checklistRaw.map((row) => {
    const item = itemLabels.get(row.checklist_item_id as string);
    return {
      completed_at: String(row.completed_at).slice(0, 10),
      chapter: item?.chapterId ?? 'Chapter',
      label: item?.label ?? 'Checklist item',
    };
  });

  const tasks = (tasksRes.data ?? []).slice(0, 40).map((row) => ({
    title: String(row.title).slice(0, 120),
    status: row.status as string,
    priority: row.priority as string,
    due_date: (row.due_date as string | null) ?? null,
    minutes: Number(row.estimated_minutes),
    completed_at: row.completed_at ? String(row.completed_at).slice(0, 10) : null,
  }));

  const difficulties = (difficultiesRes.data ?? []).slice(0, 20).map((row) => ({
    topic: String(row.topic_name).slice(0, 120),
    subject: subjectName.get(row.user_subject_id as string) ?? 'Unknown subject',
    severity: row.severity as string,
    status: row.status as string,
  }));

  const exams = (examsRes.data ?? []).map((row) => {
    const marks = Number(row.marks_obtained);
    const total = Number(row.total_marks);
    return {
      name: String(row.exam_name).slice(0, 120),
      date: row.exam_date as string,
      subject: row.user_subject_id ? subjectName.get(row.user_subject_id as string) ?? null : null,
      marks,
      total,
      percent: total > 0 ? Math.round((marks / total) * 1000) / 10 : 0,
    };
  });

  const studyMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0);
  const previousMinutes = (prevSessionsRes.data ?? []).reduce((sum, row) => sum + Number(row.duration_minutes), 0);
  const activeDays = new Set(sessions.map((session) => session.date)).size;
  const tasksCompleted = tasks.filter((task) => task.completed_at && task.completed_at >= weekStart).length;
  const tasksOpen = tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress').length;
  const tasksOverdue = tasks.filter(
    (task) => (task.status === 'todo' || task.status === 'in_progress') && task.due_date !== null && task.due_date < weekStart,
  ).length;
  const averageExamPercent =
    exams.length > 0 ? Math.round((exams.reduce((sum, exam) => sum + exam.percent, 0) / exams.length) * 10) / 10 : null;

  return {
    week_start: weekStart,
    week_end: weekEnd,
    timezone,
    locale,
    subjects: subjects.map((subject) => ({
      id: subject.id as string,
      name: subjectLabel(subject as never),
    })),
    sessions,
    lectures,
    revisions,
    checklist,
    tasks,
    difficulties,
    exams,
    metrics: {
      study_minutes: studyMinutes,
      study_minutes_previous_week: previousMinutes,
      sessions_logged: sessions.length,
      active_days: activeDays,
      lectures_recorded: lectures.length,
      lectures_completed: lectures.filter((lecture) => lecture.completed).length,
      revisions_logged: revisions.length,
      checklist_items_ticked: checklist.length,
      tasks_completed: tasksCompleted,
      tasks_open: tasksOpen,
      tasks_overdue: tasksOverdue,
      exams_recorded: exams.length,
      average_exam_percent: averageExamPercent,
      open_high_difficulties: difficulties.filter((d) => d.status !== 'resolved' && d.severity === 'high').length,
      user_id_present: userId ? 1 : 0,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Use POST.', 405);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return errorResponse('invalid_request', 'Body must be JSON.', 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('unauthenticated', 'Missing Authorization header.', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return errorResponse('not_configured', 'Supabase environment is incomplete.', 500);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return errorResponse('unauthenticated', 'Sign in again to use the AI coach.', 401);
  }
  const userId = userData.user.id;

  if (body.action === 'status') {
    const config = providerConfig();
    return jsonResponse({
      configured: Boolean(config),
      provider: config?.provider ?? null,
      model: config?.model ?? null,
      message: config
        ? 'AI provider configured server-side.'
        : 'AI_API_KEY is not set. Deterministic reports continue to work.',
    });
  }

  if (body.action !== 'generate') {
    return errorResponse('invalid_request', 'Unknown action.', 400);
  }

  const weekStart = body.week_start ?? '';
  const weekEnd = body.week_end ?? '';
  if (!DATE_RE.test(weekStart) || !DATE_RE.test(weekEnd) || weekEnd < weekStart) {
    return errorResponse('invalid_request', 'week_start and week_end must be YYYY-MM-DD and ordered.', 400);
  }
  const spanDays = Math.round(
    (new Date(`${weekEnd}T00:00:00Z`).getTime() - new Date(`${weekStart}T00:00:00Z`).getTime()) / 86_400_000,
  );
  if (spanDays < 0 || spanDays > 31) {
    return errorResponse('invalid_request', 'Request at most a 31-day range.', 400);
  }
  const timezone = (body.timezone ?? 'Asia/Dhaka').slice(0, 64);
  const locale = body.locale === 'bn' ? 'bn' : 'en';

  const config = providerConfig();
  if (!config) {
    return errorResponse(
      'not_configured',
      'AI is not configured on the server. The deterministic report needs no AI.',
      503,
    );
  }

  // Rate limit: count AI reports for this user in the last hour.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countError } = await supabase
    .from('weekly_summaries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'ai')
    .gte('created_at', hourAgo);
  if (countError) {
    return errorResponse('provider_error', 'Could not verify rate limits. Try again later.', 500);
  }
  if ((count ?? 0) >= maxPerHour()) {
    return errorResponse('rate_limited', 'Too many AI requests this hour. Your deterministic report is unaffected.', 429);
  }

  let facts: WeeklyFacts;
  try {
    facts = await buildFacts(supabase, userId, weekStart, weekEnd, timezone, locale);
  } catch (error) {
    console.error('weekly-summary/buildFacts failed', (error as Error).message);
    return errorResponse('provider_error', 'Could not read your records for this week.', 500);
  }

  const result = await generateWeeklyNarrative(config, facts);
  if (!result.ok || !result.report) {
    console.error('weekly-summary/generation failed', result.code, result.detail);
    const status = result.code === 'timeout' ? 504 : result.code === 'invalid_response' ? 422 : 502;
    const message =
      result.code === 'timeout'
        ? 'The AI service timed out. Your deterministic report is unaffected.'
        : result.code === 'invalid_response'
          ? 'The AI response failed validation (malformed or contained unsupported numbers) and was discarded.'
          : 'The AI provider returned an error. Your deterministic report is unaffected.';
    return errorResponse(result.code ?? 'provider_error', message, status);
  }

  const payload = {
    ...result.report,
    week: { start: weekStart, end: weekEnd },
    disclaimer: DISCLAIMER,
    provider: config.provider,
    model: config.model,
  };

  const { error: insertError } = await supabase.from('weekly_summaries').insert({
    user_id: userId,
    week_start: weekStart,
    week_end: weekEnd,
    source: 'ai',
    status: 'complete',
    payload,
    provider: config.provider,
    model: config.model,
    prompt_version: 'weekly-summary-v1',
    error_code: null,
  });
  if (insertError) {
    console.error('weekly-summary/save failed', insertError.message);
    return errorResponse('provider_error', 'The report was generated but could not be saved. Try again.', 500);
  }

  return jsonResponse({ report: payload, provider: config.provider, model: config.model });
});
