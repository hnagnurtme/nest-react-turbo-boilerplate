import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';

/**
 * Composition root. Feature slices live under `src/modules` and are listed
 * here; `CoreModule` stays first so its global providers exist before any
 * module that injects them.
 */
@Module({
  imports: [CoreModule],
})
export class AppModule {}
