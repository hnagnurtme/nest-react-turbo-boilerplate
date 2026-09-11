import type * as React from 'react';

import { cn } from '../lib/utils';

export type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-hand slot, typically buttons. */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 pb-6 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
