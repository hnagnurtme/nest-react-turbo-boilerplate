import type * as React from 'react';

import { cn } from '../lib/utils';

export type SkeletonProps = React.ComponentProps<'div'>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
