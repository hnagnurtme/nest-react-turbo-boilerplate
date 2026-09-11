import base from '@repo/eslint-config/base';

/**
 * The react config is deliberately NOT used here: it enforces the apps/web
 * layer boundaries (lib/shared/entities/features/app), which this package
 * does not have. What it does add is the package-level rule from doc 04
 * section 2 - the design system must stay data-fetch free.
 */
export default [
  ...base,
  {
    rules: {
      // TypeScript resolves DOM/React globals; ESLint's scope analysis does not.
      'no-undef': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'axios', message: '@repo/ui never performs I/O - take data through props.' },
            {
              name: '@tanstack/react-query',
              message: '@repo/ui never owns server state - take data through props.',
            },
            {
              name: '@repo/api-contract',
              message: '@repo/ui must not know the backend exists (doc 04 section 2).',
            },
          ],
          patterns: [
            {
              group: ['axios/*', '@tanstack/react-query/*', '@repo/api-contract/*', '@repo/api', '@repo/api/*'],
              message: '@repo/ui must not fetch data or depend on the backend (doc 04 section 2).',
            },
          ],
        },
      ],
    },
  },
];
