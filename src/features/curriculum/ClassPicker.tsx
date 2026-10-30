import { CLASS_GROUPS, classLabel, type ClassLevel } from '@/domain/classLevels';

/**
 * Class 1–12 selector.
 *
 * Grouped Primary / High School / College because twelve bare numbers in a row
 * is a wall of identical chips, and the group heading is what tells a student
 * where to look. A dot marks classes that already hold subjects, so switching
 * back to last year's work is obviously safe — nothing here deletes anything.
 */
export function ClassPicker({
  active,
  classesWithSubjects,
  onChange,
  disabled,
}: {
  active: ClassLevel | null;
  classesWithSubjects: Set<number>;
  onChange: (level: ClassLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="class-picker" role="group" aria-label="Select class">
      {CLASS_GROUPS.map((group) => (
        <div className="class-picker__group" key={group.stage}>
          <span className="class-picker__label">{group.label}</span>
          <div className="class-picker__row">
            {group.classes.map((level) => {
              const isActive = active === level;
              const hasSubjects = classesWithSubjects.has(level);
              return (
                <button
                  key={level}
                  type="button"
                  className={[
                    'class-chip',
                    isActive ? 'class-chip--active' : '',
                    hasSubjects ? 'class-chip--has-subjects' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={isActive}
                  aria-label={`${classLabel(level)}${hasSubjects ? ', has subjects' : ''}`}
                  disabled={disabled}
                  onClick={() => onChange(level)}
                >
                  {level}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
