import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

export const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        destructive: 'border-destructive/50 bg-destructive/10 text-destructive [&>svg]:text-destructive',
        warning: 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type AlertProps = React.ComponentProps<'div'> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return (
    // `alert` is assertive; destructive/warning messages must interrupt a screen reader.
    <div
      role={variant === 'default' ? 'note' : 'alert'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'h5'>) {
  return <h5 className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />;
}
