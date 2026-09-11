import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getEnv, loadEnvFile } from './config';
import { AppModule } from './app.module';

/**
 * Boots the app in memory (never listens) and writes the OpenAPI document to
 * `packages/api-contract/openapi.json`.
 *
 * The spec is committed so the frontend generates its client from a reviewed
 * artefact and CI can fail on undeclared contract drift (doc 00 principle 3).
 */
const OUTPUT = resolve(__dirname, '../../../packages/api-contract/openapi.json');

async function main(): Promise<void> {
  loadEnvFile();
  const env = getEnv();
  const app = await NestFactory.create(AppModule, { logger: ['error'], abortOnError: false });

  app.setGlobalPrefix(env.API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const config = new DocumentBuilder()
    .setTitle('API')
    .setDescription('Multi-tenant API. Errors follow RFC 9457 (application/problem+json).')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  console.warn(`OpenAPI written to ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error('Failed to generate OpenAPI document', error);
  process.exit(1);
});
