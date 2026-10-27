import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface BaseProps {
  label: string;
  name: string;
  error?: string;
  help?: string;
  optional?: boolean;
  id?: string;
}

function describedBy(id: string, error?: string, help?: string): string | undefined {
  const ids = [error ? `${id}-error` : null, help ? `${id}-help` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function Label({
  id,
  label,
  optional,
}: {
  id: string;
  label: string;
  optional?: boolean;
}) {
  return (
    <label className="field__label" htmlFor={id}>
      {label}
      {optional ? <span className="field__optional">optional</span> : null}
    </label>
  );
}

export const TextField = forwardRef<HTMLInputElement, BaseProps & InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ label, name, error, help, optional, id, className, ...rest }, ref) {
    const fieldId = id ?? name;
    return (
      <div className="field">
        <Label id={fieldId} label={label} optional={optional} />
        <input
          ref={ref}
          id={fieldId}
          name={name}
          className={`input ${className ?? ''}`.trim()}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, error, help)}
          {...rest}
        />
        {help ? (
          <span className="field__help" id={`${fieldId}-help`}>
            {help}
          </span>
        ) : null}
        {error ? (
          <span className="field__error" id={`${fieldId}-error`} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  },
);

export const TextareaField = forwardRef<HTMLTextAreaElement, BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextareaField({ label, name, error, help, optional, id, className, ...rest }, ref) {
    const fieldId = id ?? name;
    return (
      <div className="field">
        <Label id={fieldId} label={label} optional={optional} />
        <textarea
          ref={ref}
          id={fieldId}
          name={name}
          className={`textarea ${className ?? ''}`.trim()}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, error, help)}
          {...rest}
        />
        {help ? (
          <span className="field__help" id={`${fieldId}-help`}>
            {help}
          </span>
        ) : null}
        {error ? (
          <span className="field__error" id={`${fieldId}-error`} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  },
);

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

export const SelectField = forwardRef<
  HTMLSelectElement,
  BaseProps & SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }
>(function SelectField({ label, name, error, help, optional, id, className, options, placeholder, ...rest }, ref) {
  const fieldId = id ?? name;
  return (
    <div className="field">
      <Label id={fieldId} label={label} optional={optional} />
      <select
        ref={ref}
        id={fieldId}
        name={name}
        className={`select ${className ?? ''}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, help)}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {help ? (
        <span className="field__help" id={`${fieldId}-help`}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={`${fieldId}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
});

export const CheckboxField = forwardRef<
  HTMLInputElement,
  Omit<BaseProps, 'label'> & InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }
>(function CheckboxField({ label, name, error, help, id, className, ...rest }, ref) {
  const fieldId = id ?? name;
  return (
    <div className="field">
      <label className="checkbox" htmlFor={fieldId}>
        <input
          ref={ref}
          type="checkbox"
          id={fieldId}
          name={name}
          className={className}
          aria-describedby={describedBy(fieldId, error, help)}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {help ? (
        <span className="field__help" id={`${fieldId}-help`}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={`${fieldId}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
});

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="notice notice--danger" role="alert">
      <span>
        <strong>Not saved. </strong>
        {message}
      </span>
    </div>
  );
}
