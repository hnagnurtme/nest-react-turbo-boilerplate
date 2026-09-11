import type * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '../lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Content>;

export function TooltipContent({ className, sideOffset = 4, ...props }: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 overflow-hidden rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
