/**
 * Progress insights.
 *
 * The output is deliberately split into four bands so a student can see what the
 * app knows, what it calculated, what it is only guessing at, and what it is
 * missing:
 *
 *   observed        — counts straight from records
 *   calculated      — arithmetic over those records, with the formula named
 *   interpretations — explicitly labelled guesses, each with evidence
 *   missing         — what is not recorded (never "you did not study")
 *
 * The AI coach, when enabled, may add recommendations on top of this. The bands
 * themselves are deterministic and available offline.
 */
import { safePercent } from '@/domain/progress';
import { formatMinutes, type TimeSummary } from '@/domain/timeTracking';
import type { SubjectCoverage } from '@/domain/syllabus';
import type { PracticeSummary } from '@/domain/practice';
import type { MistakeAnalysis } from '@/domain/mistakes';
import type { ExamCountdown } from '@/domain/preparation';
import type { RevisionQueueEntry } from '@/domain/revisions';
import type { TaskCounts } from '@/domain/tasks';

export interface InsightItem {
  label: string;
  value: string;
  evidence: string[];
}

export interface Interpretation {
  statement: string;
  confidence: 'low' | 'medium';
  evidence: string[];
  caveat: string;
}

export interface InsighsInput {
  today: string;
  subjects: SubjectCoverage[];
  todayTime: TimeSummary;
  weekTime: TimeSummary;
  activeStudyDaysThisWeek: number;
  taskCounts: TaskCounts;
  revisionQueue: RevisionQueueEntry[];
  mistakes: MistakeAnalysis;
  practice: PracticeSummary;
  examCountdowns: ExamCountdown[];
  chaptersWithRecords: number;
  chaptersTotal: number;
  availabilityMinutesThisWeek: number;
}

export interface Insights {
  observed: InsightItem[];
  calculated: InsightItem[];
  interpretations: Interpretation[];
  missing: string[];
  nextSteps: { title: string; why: string; evidence: string[] }[];
}

export function buildInsights(input: InsighsInput): Insights {
  const observed: InsightItem[] = [
    {
      label: 'Study time recorded today',
      value: formatMinutes(input.todayTime.studyMinutes),
      evidence: [`${input.todayTime.studyEntries} study entr${input.todayTime.studyEntries === 1 ? 'y' : 'ies'} dated ${input.today}`],
    },
    {
      label: 'Study time recorded this week',
      value: formatMinutes(input.weekTime.studyMinutes),
      evidence: [`${input.activeStudyDaysThisWeek} day(s) with at least one study session`],
    },
    {
      label: 'Other time recorded this week',
      value: formatMinutes(input.weekTime.otherMinutes),
      evidence: [
        input.weekTime.byCategory
          .filter((category) => !['reading', 'notes', 'practice', 'concept_review', 'test', 'other'].includes(category.category))
          .slice(0, 3)
          .map((category) => `${category.label} ${formatMinutes(category.minutes)}`),
      ].flat(),
    },
    {
      label: 'Tasks',
      value: `${input.taskCounts.open} open · ${input.taskCounts.overdue} overdue · ${input.taskCounts.doneThisWeek} done this week`,
      evidence: [`${input.taskCounts.dueToday} due today`],
    },
    {
      label: 'Revisions logged',
      value: String(input.revisionQueue.reduce((sum, entry) => sum + entry.summary.count, 0)),
      evidence: [
        `${input.revisionQueue.filter((entry) => entry.bucket === 'overdue').length} chapter(s) past their next review date`,
      ],
    },
    {
      label: 'Mistakes logged',
      value: `${input.mistakes.total} total · ${input.mistakes.unresolved} unresolved`,
      evidence: input.mistakes.byCategory.slice(0, 3).map((category) => `${category.label}: ${category.count}`),
    },
    {
      label: 'Practice attempts',
      value: `${input.practice.attempts} attempt(s) on ${input.practice.attemptedQuestions} question(s)`,
      evidence: [
        input.practice.accuracyPercent === null
          ? 'No graded attempts yet'
          : `${input.practice.accuracyPercent}% of graded attempts correct`,
      ],
    },
  ];

  const calculated: InsightItem[] = [];
  const chapterPercent = safePercent(input.chaptersWithRecords, input.chaptersTotal);
  calculated.push({
    label: 'Chapters with any record',
    value:
      chapterPercent === null
        ? 'Not recorded'
        : `${input.chaptersWithRecords}/${input.chaptersTotal} (${chapterPercent}%)`,
    evidence: ['A chapter counts here when it has any lecture, session, revision, checklist tick or result'],
  });
  calculated.push({
    label: 'Recorded time against your stated availability',
    value:
      input.availabilityMinutesThisWeek <= 0
        ? 'No availability entered'
        : `${formatMinutes(input.weekTime.studyMinutes)} of ${formatMinutes(input.availabilityMinutesThisWeek)}`,
    evidence: ['Your study windows from the profile — not a target the app invented'],
  });
  for (const subject of input.subjects) {
    if (subject.chapters === 0) continue;
    calculated.push({
      label: 'Syllabus completion',
      value:
        subject.chapterPercent === null
          ? 'No chapters recorded'
          : `${subject.chaptersComplete}/${subject.chapters} chapters (${subject.chapterPercent}%) · ${subject.topicsComplete}/${subject.topics} topics`,
      evidence: [
        `${subject.chaptersNotRecorded} chapter(s) with no records`,
        'Complete means the status you set, or evidenced mastery per the progress rules',
      ],
    });
    break;
  }
  if (input.practice.gradedAttempts > 0) {
    calculated.push({
      label: 'Practice accuracy',
      value: `${input.practice.accuracyPercent}% (${input.practice.correct}/${input.practice.gradedAttempts} graded)`,
      evidence: ['Only attempts you graded correct/incorrect are counted'],
    });
  }

  const interpretations: Interpretation[] = [];
  for (const entry of input.revisionQueue.filter((item) => item.bucket === 'overdue').slice(0, 2)) {
    interpretations.push({
      statement: `${entry.chapterTitle} may be at risk of fading from memory.`,
      confidence: 'medium',
      evidence: [
        `Next review was ${entry.summary.nextDate}`,
        `Last confidence ${entry.summary.lastConfidence ?? 'not recorded'}/5`,
      ],
      caveat: 'A missed review date is evidence about scheduling, not about your ability.',
    });
  }
  if (input.mistakes.recurring.length > 0) {
    const top = input.mistakes.recurring[0];
    interpretations.push({
      statement: `${top?.categoryLabel ?? 'A mistake type'} mistakes may be repeating in ${top?.chapterTitle ?? 'your work'}.`,
      confidence: 'medium',
      evidence: top?.evidence.slice(0, 2) ?? [],
      caveat: 'Only recorded mistakes are visible; mistakes outside the app are unknown.',
    });
  }
  if (input.taskCounts.overdue >= 3) {
    interpretations.push({
      statement: 'The current plan may be larger than the time you actually have.',
      confidence: 'medium',
      evidence: [`${input.taskCounts.overdue} overdue tasks`, `${input.taskCounts.totalMinutesOpen} minutes of open tasks`],
      caveat: 'Overdue tasks can also mean the week changed, not that you were lazy.',
    });
  }
  if (input.examCountdowns.some((countdown) => countdown.daysRemaining >= 0 && countdown.daysRemaining <= 14)) {
    const next = input.examCountdowns.find((countdown) => countdown.daysRemaining >= 0 && countdown.daysRemaining <= 14);
    interpretations.push({
      statement: `${next?.title ?? 'An exam'} is close enough that revision will compete with new chapters.`,
      confidence: 'low',
      evidence: [`Exam date ${next?.examDate}`, next?.label ?? ''],
      caveat: 'This is scheduling arithmetic, not a prediction of results.',
    });
  }

  const missing: string[] = [];
  if (input.weekTime.studyMinutes === 0) missing.push('No study sessions recorded this week.');
  if (input.weekTime.otherMinutes === 0) missing.push('No non-study day blocks recorded this week (college, classes, sleep, breaks).');
  if (input.availabilityMinutesThisWeek <= 0) missing.push('No weekly availability entered, so plans cannot be sized to your week.');
  if (input.practice.gradedAttempts === 0) missing.push('No graded practice attempts yet, so accuracy is not recorded.');
  if (input.mistakes.total === 0) missing.push('No mistakes logged, so error patterns cannot be analysed.');
  if (input.revisionQueue.length === 0) missing.push('No revisions recorded, so no review dates exist.');
  if (input.examCountdowns.length === 0) missing.push('No upcoming exam dates recorded.');
  missing.push('Anything you did outside the app is unknown. Missing records are not proof of inactivity.');

  const nextSteps: Insights['nextSteps'] = [];
  const overdueRevision = input.revisionQueue.find((entry) => entry.bucket === 'overdue');
  if (overdueRevision) {
    nextSteps.push({
      title: `Revise ${overdueRevision.chapterTitle}`,
      why: 'Its next review date has passed.',
      evidence: [`Due ${overdueRevision.summary.nextDate}`, `Subject: ${overdueRevision.subjectName}`],
    });
  }
  if (input.taskCounts.overdue > 0) {
    nextSteps.push({
      title: 'Reschedule or shrink the overdue tasks',
      why: 'Overdue tasks stay visible; rescheduling keeps the plan realistic.',
      evidence: [`${input.taskCounts.overdue} overdue task(s)`],
    });
  }
  if (input.practice.flaggedQuestions > 0) {
    nextSteps.push({
      title: `Review ${input.practice.flaggedQuestions} flagged practice question(s)`,
      why: 'You marked them for review or answered them incorrectly.',
      evidence: [`${input.practice.flaggedQuestions} question(s) flagged`],
    });
  }
  if (nextSteps.length === 0) {
    nextSteps.push({
      title: 'Keep logging what you actually do',
      why: 'No evidence-based gap is flagged right now; records are what make the next insight possible.',
      evidence: [`${input.chaptersWithRecords} chapter(s) with records`],
    });
  }

  return { observed, calculated, interpretations, missing, nextSteps };
}
