import type * as React from 'react';
import { Loader2Icon } from 'lucide-react';

import { Button } from '../primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog';

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** May return a promise; the dialog stays open while `isLoading` is true. */
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  function handleOpenChange(next: boolean) {
    // An in-flight action must not be dismissed by Esc or an overlay click.
    if (isLoading) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        showCloseButton={!isLoading}
        onInteractOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isLoading}
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            disabled={isLoading}
            onClick={() => void onConfirm()}
          >
            {isLoading ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
