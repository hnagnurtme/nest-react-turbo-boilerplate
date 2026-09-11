import { useId, type ReactNode } from 'react';

import { Label } from '../primitives/label';
import { cn } from '../lib/utils';

/** Accessibility wiring handed to the control rendered inside the field. */
export type FormControlProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  'aria-required'?: true;
};

export type FormFieldProps = {
  label: ReactNode;
  /** Render prop receives the ids/aria attributes the control must spread. */
  children: ReactNode | ((control: FormControlProps) => ReactNode);
  description?: ReactNode;
  /** Message from validation; its presence flips the field into the invalid state. */
  error?: string | undefined;
  required?: boolean;
  /** Override the generated id when the control id is fixed by something else. */
  id?: string;
  className?: string;
};

export function FormField({
  label,
  children,
  description,
  error,
  required = false,
  id,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const errorId = `${controlId}-error`;
  const descriptionId = `${controlId}-description`;

  // Screen readers announce describedby in order: the error first, then the hint.
  const describedBy = [error ? errorId : null, description ? descriptionId : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  const control: FormControlProps = {
    id: controlId,
    ...(error ? { 'aria-invalid': true as const } : {}),
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(required ? { 'aria-required': true as const } : {}),
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={controlId}>
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>

      {typeof children === 'function' ? children(control) : children}

      {description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
