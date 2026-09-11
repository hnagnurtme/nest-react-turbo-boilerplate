import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../../core/decorators';
import { NoEnvelope } from '../../core/decorators';
import { DATABASE, type AppDatabase } from '../../core/database/drizzle.module';

/**
 * Unversioned and unprefixed on purpose (see main.ts's setGlobalPrefix
 * exclude list) — a load balancer or orchestrator health-checking
 * `/api/v1/healthz` is one API version bump away from probing a route that
 * no longer exists.
 */
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  /**
   * Liveness: is the process alive at all. Deliberately never touches the
   * database — a flaky database must not get this container killed and
   * restarted in a loop by the orchestrator (doc 06 section 2.1).
   */
  @Get('healthz')
  @Public()
  @NoEnvelope()
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness: can this instance actually serve traffic right now. Used by
   * the load balancer and by scripts/deploy.sh before it swaps containers.
   */
  @Get('readyz')
  @Public()
  @NoEnvelope()
  async readiness(): Promise<{ status: 'ok' }> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
