import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { arrowForwardOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { LogoMark } from '@/components/brand/Logo';
import { useMutate } from '@/hooks/useWorkspace';
import {
  STUDY_GROUPS,
  STUDY_GROUP_LABELS,
  groupAppliesToClass,
  normaliseGroup,
  type StudyGroup,
} from '@/domain/studentProfile';
import { CLASS_GROUPS, classLabel, type ClassLevel } from '@/domain/classLevels';

/**
 * First launch: class, then group when it applies.
 *
 * Two taps, one screen, no account required. The answers are saved to the
 * profile so every later screen can scope itself to that class. Nothing else is
 * asked here — a student who wants to start immediately can skip and choose
 * later from Settings.
 */
export function OnboardingPage({ onDone }: { onDone: () => void }) {
  const mutate = useMutate();
  const [step, setStep] = useState<'class' | 'group'>('class');
  const [classLevel, setClassLevel] = useState<ClassLevel | null>(null);
  const [group, setGroup] = useState<StudyGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsGroup = groupAppliesToClass(classLevel);
  const groupRequired = classLevel === 11 || classLevel === 12;

  const save = async (level: ClassLevel | null, selectedGroup: StudyGroup | null) => {
    setSaving(true);
    setError(null);
    try {
      await mutate((repository) =>
        repository.updateProfile({
          active_class: level,
          active_group: groupAppliesToClass(level) ? selectedGroup : null,
          onboarded_at: new Date().toISOString(),
        }),
      );
      onDone();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Your choice could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const continueFromClass = () => {
    if (classLevel === null) return;
    if (!needsGroup) {
      void save(classLevel, null);
      return;
    }
    setStep('group');
  };

  const finish = () => {
    if (classLevel === null) return;
    if (groupRequired && normaliseGroup(group) === null) {
      setError('Choose your group to continue.');
      return;
    }
    void save(classLevel, group);
  };

  return (
    <div className="onboarding">
      <div className="onboarding__card">
        <div className="onboarding__steps" aria-hidden="true">
          <span className="onboarding__dot onboarding__dot--on" />
          <span className={`onboarding__dot${step === 'group' ? ' onboarding__dot--on' : ''}`} />
        </div>

        <div className="logo-lockup">
          <LogoMark size={52} />
          <div className="logo-lockup__text">
            <span className="logo-lockup__name">MKJ StudyOS</span>
            <span className="logo-lockup__tagline">Study smarter. Stay consistent.</span>
          </div>
        </div>

        {step === 'class' ? (
          <>
            <div>
              <h1 className="onboarding__title">Which class do you study in?</h1>
              <p className="onboarding__sub">
                This sets the curriculum you see. You can change it any time, and nothing you record is lost.
              </p>
            </div>

            {CLASS_GROUPS.map((groupInfo) => (
              <section key={groupInfo.stage} aria-label={groupInfo.label}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  {groupInfo.label}
                </div>
                <div className="onboarding__grid">
                  {groupInfo.classes.map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`onboarding__choice${classLevel === level ? ' onboarding__choice--on' : ''}`}
                      aria-pressed={classLevel === level}
                      onClick={() => setClassLevel(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </section>
            ))}

            {error ? <p className="field__error">{error}</p> : null}

            <div className="onboarding__actions">
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={classLevel === null || saving}
                onClick={continueFromClass}
              >
                {saving ? 'Saving…' : 'Continue'}
                <IonIcon icon={arrowForwardOutline} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className="onboarding__skip"
              disabled={saving}
              onClick={() => void save(null, null)}
            >
              I’ll choose later
            </button>
          </>
        ) : (
          <>
            <div>
              <h1 className="onboarding__title">
                Which group are you in <span className="muted">· {classLabel(classLevel)}</span>?
              </h1>
              <p className="onboarding__sub">
                {groupRequired
                  ? 'Your group decides which subjects and papers appear first.'
                  : 'Optional. Choose one if it applies to you — you can change it later.'}
              </p>
            </div>

            <div className="stack" role="radiogroup" aria-label="Study group">
              {STUDY_GROUPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={group === value}
                  className={`onboarding__choice onboarding__choice--row${
                    group === value ? ' onboarding__choice--on' : ''
                  }`}
                  onClick={() => setGroup(value)}
                >
                  <span>{STUDY_GROUP_LABELS[value].label}</span>
                  <span className="onboarding__choice-bn bn">{STUDY_GROUP_LABELS[value].labelBn}</span>
                </button>
              ))}
              {!groupRequired ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={group === null}
                  className={`onboarding__choice onboarding__choice--row${
                    group === null ? ' onboarding__choice--on' : ''
                  }`}
                  onClick={() => setGroup(null)}
                >
                  <span>Not sure yet</span>
                  <span className="onboarding__choice-bn muted">You can pick later</span>
                </button>
              ) : null}
            </div>

            {error ? <p className="field__error">{error}</p> : null}

            <div className="onboarding__actions">
              <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setStep('class')}>
                Back
              </button>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={finish}>
                {saving ? 'Saving…' : (
                  <>
                    Start studying <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
