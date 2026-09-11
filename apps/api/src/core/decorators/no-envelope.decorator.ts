import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const NO_ENVELOPE_KEY = 'noEnvelope';

/**
 * Skips the `{ data, meta }` wrapper. Needed for file downloads, SSE and any
 * response whose body is not JSON we own.
 */
export const NoEnvelope = (): CustomDecorator<string> => SetMetadata(NO_ENVELOPE_KEY, true);
