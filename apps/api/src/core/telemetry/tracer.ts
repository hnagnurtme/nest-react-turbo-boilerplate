import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';

/**
 * MUST be the first import in `main.ts` (doc 02 section 5).
 *
 * Auto-instrumentation works by monkey-patching `http`, `pg` and `ioredis` as
 * they are required. Load anything else first and those modules are already
 * resolved: traces come out empty and nothing reports an error.
 *
 * This file therefore reads `process.env` directly rather than the validated
 * config — the validation itself would be an earlier import.
 */
const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'api',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  }),
  // Reads OTEL_EXPORTER_OTLP_ENDPOINT; without it the exporter buffers and drops.
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    getNodeAutoInstrumentations({
      // One span per file read drowns out everything worth looking at.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

// Flush pending spans on the same signals Nest's shutdown hooks listen to.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void sdk.shutdown().catch(() => undefined);
  });
}

export { sdk };
