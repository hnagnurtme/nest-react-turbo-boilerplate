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
const CONTRACT_OUTPUT = resolve(__dirname, '../../../packages/api-contract/openapi.json');
const API_OUTPUT = resolve(__dirname, '../openapi.json');

const schemas: Record<string, unknown> = {
  UserDto: {
    type: 'object',
    required: ['id', 'email', 'platformRole'],
    properties: {
      id: { type: 'string' },
      email: { type: 'string' },
      platformRole: { type: 'string', enum: ['ADMIN', 'MEMBER'] },
    },
  },
  TenantDto: {
    type: 'object',
    required: ['id', 'name', 'slug'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      slug: { type: 'string' },
    },
  },
  MembershipDto: {
    type: 'object',
    required: ['id', 'tenantId', 'role', 'status'],
    properties: {
      id: { type: 'string' },
      tenantId: { type: 'string' },
      role: { type: 'string' },
      status: { type: 'string', enum: ['ACTIVE', 'INVITED', 'SUSPENDED'] },
    },
  },
  LoginDto: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string' },
      password: { type: 'string' },
    },
  },
  LoginResponseDto: {
    type: 'object',
    required: ['accessToken', 'csrfToken', 'user', 'memberships'],
    properties: {
      accessToken: { type: 'string' },
      csrfToken: { type: 'string' },
      user: { $ref: '#/components/schemas/UserDto' },
      memberships: {
        type: 'array',
        items: { $ref: '#/components/schemas/MembershipDto' },
      },
    },
  },
  RefreshResponseDto: {
    type: 'object',
    required: ['accessToken', 'csrfToken'],
    properties: {
      accessToken: { type: 'string' },
      csrfToken: { type: 'string' },
    },
  },
  AccessTokenResponseDto: {
    type: 'object',
    required: ['accessToken'],
    properties: {
      accessToken: { type: 'string' },
    },
  },
  TenantMembershipDto: {
    allOf: [
      { $ref: '#/components/schemas/MembershipDto' },
      {
        type: 'object',
        required: ['tenant'],
        properties: {
          tenant: { $ref: '#/components/schemas/TenantDto' },
        },
      },
    ],
  },
  MeResponseDto: {
    type: 'object',
    required: ['user', 'memberships'],
    properties: {
      user: { $ref: '#/components/schemas/UserDto' },
      memberships: {
        type: 'array',
        items: { $ref: '#/components/schemas/TenantMembershipDto' },
      },
    },
  },
  SwitchTenantDto: {
    type: 'object',
    required: ['tenantId'],
    properties: {
      tenantId: { type: 'string' },
    },
  },
  ItemStatus: {
    type: 'string',
    enum: ['ACTIVE', 'ARCHIVED'],
  },
  Item: {
    type: 'object',
    required: [
      'id',
      'tenantId',
      'title',
      'description',
      'status',
      'createdBy',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: { type: 'string' },
      tenantId: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string', nullable: true },
      status: { $ref: '#/components/schemas/ItemStatus' },
      createdBy: { type: 'string' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' },
    },
  },
  CreateItemDto: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
    },
  },
  UpdateItemDto: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      status: { $ref: '#/components/schemas/ItemStatus' },
    },
  },
  PaginatedItems: {
    type: 'object',
    required: ['items', 'meta'],
    properties: {
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/Item' },
      },
      meta: {
        type: 'object',
        required: ['page', 'limit', 'total', 'totalPages'],
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          total: { type: 'number' },
          totalPages: { type: 'number' },
        },
      },
    },
  },
};

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

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => {
      const controller = controllerKey.replace('Controller', '').toLowerCase();
      if (controller === 'auth') {
        return methodKey; // login, refresh, logout, me, switchTenant
      }
      if (controller === 'items') {
        if (methodKey === 'list') return 'items';
        if (methodKey === 'findOne') return 'item';
        if (methodKey === 'create') return 'createItem';
        if (methodKey === 'update') return 'updateItem';
        if (methodKey === 'remove') return 'deleteItem';
      }
      return `${controllerKey}_${methodKey}`;
    },
  });

  document.components = document.components || {};
  document.components.schemas = {
    ...document.components.schemas,
    ...(schemas as Record<string, never>),
  };

  if (document.paths['/api/v1/auth/login']?.post) {
    document.paths['/api/v1/auth/login'].post.requestBody = {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginDto' } } },
    };
    document.paths['/api/v1/auth/login'].post.responses['200'] = {
      description: 'Login successful',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/LoginResponseDto' } },
      },
    };
    delete document.paths['/api/v1/auth/login'].post.responses['201'];
  }

  if (document.paths['/api/v1/auth/refresh']?.post) {
    document.paths['/api/v1/auth/refresh'].post.requestBody = {
      content: {
        'application/json': {
          schema: { type: 'object', properties: { refreshToken: { type: 'string' } } },
        },
      },
    };
    document.paths['/api/v1/auth/refresh'].post.responses['200'] = {
      description: 'Token refreshed',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/RefreshResponseDto' } },
      },
    };
    delete document.paths['/api/v1/auth/refresh'].post.responses['201'];
  }

  if (document.paths['/api/v1/auth/me']?.get) {
    document.paths['/api/v1/auth/me'].get.responses['200'] = {
      description: 'Current user session',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/MeResponseDto' } } },
    };
  }

  if (document.paths['/api/v1/auth/switch-tenant']?.post) {
    document.paths['/api/v1/auth/switch-tenant'].post.requestBody = {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/SwitchTenantDto' } } },
    };
    document.paths['/api/v1/auth/switch-tenant'].post.responses['200'] = {
      description: 'Tenant switched',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/AccessTokenResponseDto' } },
      },
    };
    delete document.paths['/api/v1/auth/switch-tenant'].post.responses['201'];
  }

  if (document.paths['/api/v1/items']?.get) {
    document.paths['/api/v1/items'].get.parameters = [
      { name: 'page', in: 'query', schema: { type: 'number' } },
      { name: 'limit', in: 'query', schema: { type: 'number' } },
      { name: 'sort', in: 'query', schema: { type: 'string' } },
    ];
    document.paths['/api/v1/items'].get.responses['200'] = {
      description: 'Paginated list of items',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedItems' } } },
    };
  }

  if (document.paths['/api/v1/items']?.post) {
    document.paths['/api/v1/items'].post.requestBody = {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateItemDto' } } },
    };
    document.paths['/api/v1/items'].post.responses['201'] = {
      description: 'Item created',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } },
    };
  }

  if (document.paths['/api/v1/items/{id}']?.get) {
    document.paths['/api/v1/items/{id}'].get.responses['200'] = {
      description: 'Item detail',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } },
    };
  }

  if (document.paths['/api/v1/items/{id}']?.patch) {
    document.paths['/api/v1/items/{id}'].patch.requestBody = {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateItemDto' } } },
    };
    document.paths['/api/v1/items/{id}'].patch.responses['200'] = {
      description: 'Item updated',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } },
    };
  }

  const specJson = `${JSON.stringify(document, null, 2)}\n`;

  mkdirSync(dirname(CONTRACT_OUTPUT), { recursive: true });
  writeFileSync(CONTRACT_OUTPUT, specJson, 'utf8');

  mkdirSync(dirname(API_OUTPUT), { recursive: true });
  writeFileSync(API_OUTPUT, specJson, 'utf8');

  await app.close();
  console.warn(`OpenAPI written to ${CONTRACT_OUTPUT} and ${API_OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error('Failed to generate OpenAPI document', error);
  process.exit(1);
});
