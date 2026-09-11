import { trace } from '@opentelemetry/api';

/** Current W3C trace id, or `undefined` outside a sampled span. */
export function getActiveTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}
