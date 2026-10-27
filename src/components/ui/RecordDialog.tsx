import { useState, type ReactNode } from 'react';
import { IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { useForm, type DefaultValues, type FieldValues, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodTypeAny } from 'zod';
import { CheckboxField, FormError, SelectField, TextField, TextareaField, type Option } from '@/components/ui/Form';
import { errorMessage } from '@/utils/errors';

export interface DialogField {
  name: string;
  label: string;
  type:
    | 'text'
    | 'email'
    | 'password'
    | 'number'
    | 'date'
    | 'time'
    | 'url'
    | 'textarea'
    | 'select'
    | 'checkbox';
  placeholder?: string;
  help?: string;
  optional?: boolean;
  rows?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  autoComplete?: string;
  options?: Option[] | ((values: FieldValues) => Option[]);
  visibleWhen?: (values: FieldValues) => boolean;
}

export interface RecordDialogProps<TValues extends FieldValues> {
  title: string;
  description?: ReactNode;
  fields: DialogField[];
  schema: ZodTypeAny;
  defaultValues: DefaultValues<TValues> | Record<string, unknown>;
  submitLabel: string;
  onSubmit(values: TValues): Promise<void>;
  onClose(): void;
  extraActions?: ReactNode;
}

/**
 * Accessible modal form used by every record editor.
 * Validation runs through the same Zod schema the repository payload uses.
 */
export function RecordDialog<TValues extends FieldValues>({
  title,
  description,
  fields,
  schema,
  defaultValues,
  submitLabel,
  onSubmit,
  onClose,
  extraActions,
}: RecordDialogProps<TValues>) {
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema) as Resolver<FieldValues>,
    defaultValues: defaultValues as DefaultValues<FieldValues>,
    mode: 'onSubmit',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const values = form.watch();

  const submit = form.handleSubmit(async (raw) => {
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(raw as TValues);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <IonModal isOpen onDidDismiss={onClose} className="ion-modal-form" aria-label={title}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} disabled={submitting} aria-label="Close dialog">
              Close
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <form className="form" onSubmit={submit} noValidate>
          {description ? <div className="small muted">{description}</div> : null}
          <FormError message={formError} />
          {fields.map((field) => {
            if (field.visibleWhen && !field.visibleWhen(values)) return null;
            const error = form.formState.errors[field.name]?.message as string | undefined;
            const common = {
              label: field.label,
              error,
              optional: field.optional,
              help: field.help,
              ...form.register(field.name),
            };
            if (field.type === 'textarea') {
              return (
                <TextareaField
                  key={field.name}
                  {...common}
                  rows={field.rows ?? 4}
                  placeholder={field.placeholder}
                />
              );
            }
            if (field.type === 'select') {
              const options = typeof field.options === 'function' ? field.options(values) : field.options ?? [];
              return (
                <SelectField
                  key={field.name}
                  {...common}
                  options={options}
                  placeholder={field.placeholder ?? 'Choose…'}
                />
              );
            }
            if (field.type === 'checkbox') {
              return <CheckboxField key={field.name} {...common} label={field.label} />;
            }
            return (
              <TextField
                key={field.name}
                {...common}
                type={field.type}
                placeholder={field.placeholder}
                min={field.min}
                max={field.max}
                step={field.step}
                inputMode={field.inputMode}
                autoComplete={field.autoComplete}
              />
            );
          })}
          <div className="form-actions">
            {extraActions}
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </IonContent>
    </IonModal>
  );
}
