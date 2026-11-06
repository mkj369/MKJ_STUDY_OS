import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_TRACKS,
  CLASS_LEVELS,
  curriculumLevelForTrack,
  groupsForTrack,
  isAcademicTrack,
  resolveVersion,
  sessionsForTrack,
  trackFromLegacyLevel,
  trackUsesClassLevel,
  versionsForTrack,
} from '@/domain/tracks';
import { REFERENCE_CURRICULUM } from '@/services/seed/referenceSyllabus';
import { OFFICIAL_CURRICULUM } from '@/services/seed/officialCurriculum';

const versions = OFFICIAL_CURRICULUM.versions;

describe('academic tracks', () => {
  it('maps HSC Admission to the HSC curriculum — never a duplicate syllabus', () => {
    expect(curriculumLevelForTrack('ssc')).toBe('SSC');
    expect(curriculumLevelForTrack('hsc')).toBe('HSC');
    expect(curriculumLevelForTrack('hsc_admission')).toBe('HSC');
    // The exact same version rows serve both tracks.
    const hsc = versionsForTrack(versions, 'hsc');
    const admission = versionsForTrack(versions, 'hsc_admission');
    expect(admission.map((v) => v.id)).toEqual(hsc.map((v) => v.id));
    expect(hsc.length).toBeGreaterThan(0);
  });

  it('validates track values', () => {
    expect(isAcademicTrack('hsc')).toBe(true);
    expect(isAcademicTrack('hsc_admission')).toBe(true);
    expect(isAcademicTrack('class_1_5')).toBe(true);
    expect(isAcademicTrack('class_6_8')).toBe(true);
    expect(isAcademicTrack('primary')).toBe(false);
    expect(isAcademicTrack(null)).toBe(false);
  });

  it('offers the five sections with correct class options', () => {
    expect(ACADEMIC_TRACKS).toEqual(['class_1_5', 'class_6_8', 'ssc', 'hsc', 'hsc_admission']);
    expect(CLASS_LEVELS.class_1_5).toEqual(['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5']);
    expect(CLASS_LEVELS.class_6_8).toEqual(['Class 6', 'Class 7', 'Class 8']);
    expect(trackUsesClassLevel('class_1_5')).toBe(true);
    expect(trackUsesClassLevel('class_6_8')).toBe(true);
    expect(trackUsesClassLevel('ssc')).toBe(false);
    expect(trackUsesClassLevel('hsc_admission')).toBe(false);
    // School tracks map to their own levels; no seeded curriculum → no groups.
    expect(curriculumLevelForTrack('class_1_5')).toBe('Primary');
    expect(curriculumLevelForTrack('class_6_8')).toBe('Junior');
    expect(groupsForTrack(versions, 'class_1_5')).toEqual([]);
    expect(resolveVersion(versions, 'class_6_8', '', '')).toBeNull();
  });

  it('prefers the imported chapter syllabus over structure-only versions', () => {
    const all = [...versions, ...REFERENCE_CURRICULUM.versions];
    const resolved = resolveVersion(all, 'hsc', 'Science', '');
    expect(resolved?.id).toBe(REFERENCE_CURRICULUM.versions[0]?.id);
    expect(resolved?.scope).not.toBe('subject_structure');
    // Admission resolves to the SAME row — no duplication.
    const admission = resolveVersion(all, 'hsc_admission', 'Science', '');
    expect(admission?.id).toBe(resolved?.id);
    // Humanities still resolves to the structure-only version.
    expect(resolveVersion(all, 'hsc', 'Humanities', '')?.scope).toBe('subject_structure');
  });

  it('derives groups and sessions from the seeded structure', () => {
    const groups = groupsForTrack(versions, 'hsc');
    expect(groups).toContain('Science');
    expect(groups).toContain('Humanities');
    expect(groups).toContain('Business Studies');
    const sessions = sessionsForTrack(versions, 'ssc', 'Science');
    expect(sessions.length).toBeGreaterThan(0);
  });

  it('resolves a version for track + group + session, falling back honestly', () => {
    const version = resolveVersion(versions, 'hsc_admission', 'Science', sessionsForTrack(versions, 'hsc', 'Science')[0] ?? '');
    expect(version).not.toBeNull();
    expect(version?.education_level).toBe('HSC');
    expect(version?.stream).toBe('Science');
    // Unknown session falls back to the first version for the group, not null.
    const fallback = resolveVersion(versions, 'hsc', 'Science', '1999');
    expect(fallback?.stream).toBe('Science');
    // Unknown group has no candidates.
    expect(resolveVersion(versions, 'hsc', 'Arts & Crafts', '2026')).toBeNull();
  });

  it('infers tracks from legacy v1 profiles without guessing unknown levels', () => {
    expect(trackFromLegacyLevel('HSC')).toBe('hsc');
    expect(trackFromLegacyLevel('ssc')).toBe('ssc');
    expect(trackFromLegacyLevel('HSC Admission')).toBe('hsc_admission');
    expect(trackFromLegacyLevel('Class 7')).toBeNull();
    expect(trackFromLegacyLevel(null)).toBeNull();
  });
});
