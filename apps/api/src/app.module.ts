import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth';
import { HealthModule } from './modules/health';
import { ItemsModule } from './modules/items';

/**
 * Composition root. Feature slices live under `src/modules` and are listed
 * here; `CoreModule` stays first so its global providers exist before any
 * module that injects them.
 */
@Module({
  imports: [CoreModule, HealthModule, AuthModule, ItemsModule],
})
export class AppModule {}
