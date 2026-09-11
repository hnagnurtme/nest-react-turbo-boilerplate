import type * as React from 'react';
import { Toaster as SonnerToaster, toast } from 'sonner';

export type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Sonner renders outside the app tree, so it cannot inherit Tailwind classes
 * from an ancestor - the design tokens are handed to it explicitly.
 */
export function Toaster({ position = 'top-right', ...props }: ToasterProps) {
  return (
    <SonnerToaster
      position={position}
      // The palette already flips with the colour scheme; let Sonner inherit it.
      theme="system"
      style={
        {
          '--normal-bg': 'var(--color-popover)',
          '--normal-text': 'var(--color-popover-foreground)',
          '--normal-border': 'var(--color-border)',
          '--error-bg': 'var(--color-destructive)',
          '--error-text': 'var(--color-destructive-foreground)',
          '--border-radius': 'var(--radius-lg)',
          fontFamily: 'var(--font-sans)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'font-sans text-sm shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { toast };
