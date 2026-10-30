import { useState } from 'react';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { useNotify } from '@/features/shared/WorkspaceGate';
import { SectionCard } from '@/components/ui/Page';
import { CLASS_GROUPS, classLabel, type ClassLevel } from '@/domain/classLevels';
import {
  STUDY_GROUPS,
  STUDY_GROUP_LABELS,
  groupAppliesToClass,
  normaliseGroup,
  type StudyGroup,
} from '@/domain/studentProfile';

/**
 * Change the active class or group.
 *
 * This is a view change. Every subject keeps its own `class_level`, so moving to
 * Class 10 to look at last year's work never relabels, archives or deletes the
 * Class 11 records — switch back and they are exactly where they were.
 */
export function ClassAndGroupSection() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);

  if (!data) return null;
  const profile = data.bundle.profile;
  const activeClass: ClassLevel | null =
    typeof profile.active_class === 'number' ? (profile.active_class as ClassLevel) : null;
  const activeGroup = normaliseGroup(profile.active_group);

  const save = async (level: ClassLevel | null, group: StudyGroup | null) => {
    setSaving(true);
    try {
      await mutate((repository) =>
        repository.updateProfile({
          active_class: level,
          active_group: groupAppliesToClass(level) ? group : null,
        }),
      );
      await notify(
        level === null
          ? 'Class filter cleared — every subject is visible.'
          : `Showing ${classLabel(level)}${group ? ` · ${STUDY_GROUP_LABELS[group].label}` : ''}.`,
      );
    } catch (error) {
      await notify(error instanceof Error ? error.message : 'Could not save that change.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Class & group"
      hint="Sets which subjects every screen shows. Switching never deletes anything."
    >
      <div className="stack">
        {CLASS_GROUPS.map((groupInfo) => (
          <div key={groupInfo.stage}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {groupInfo.label}
            </div>
            <div className="class-picker__row">
              {groupInfo.classes.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`class-chip${activeClass === level ? ' class-chip--active' : ''}`}
                  aria-pressed={activeClass === level}
                  disabled={saving}
                  onClick={() => void save(level, activeGroup)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        ))}

        {groupAppliesToClass(activeClass) ? (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Group
            </div>
            <div className="class-picker__row">
              {STUDY_GROUPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`class-chip${activeGroup === value ? ' class-chip--active' : ''}`}
                  aria-pressed={activeGroup === value}
                  disabled={saving}
                  onClick={() => void save(activeClass, value)}
                >
                  {STUDY_GROUP_LABELS[value].label}
                </button>
              ))}
              <button
                type="button"
                className={`class-chip${activeGroup === null ? ' class-chip--active' : ''}`}
                aria-pressed={activeGroup === null}
                disabled={saving}
                onClick={() => void save(activeClass, null)}
              >
                No group
              </button>
            </div>
          </div>
        ) : null}

        <div className="row row--between">
          <p className="tiny muted">
            {activeClass === null
              ? 'No class filter: every subject you own is visible.'
              : `Showing ${classLabel(activeClass)}${activeGroup ? ` · ${STUDY_GROUP_LABELS[activeGroup].label}` : ''}. Subjects from other classes stay saved.`}
          </p>
          {activeClass !== null ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={saving}
              onClick={() => void save(null, null)}
            >
              Show everything
            </button>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
