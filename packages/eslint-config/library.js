import { base } from './base.js';

/**
 * For packages that must run on Node, in the browser AND in React Native
 * (packages/shared). Node builtins here break the mobile bundle.
 */
export const library = [
  ...base,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'child_process'],
              message:
                'packages/shared must run in Node, the browser and React Native. Node builtins break the mobile bundle.',
            },
            {
              group: ['axios', 'react', 'react-dom', '@nestjs/*'],
              message: 'packages/shared must stay runtime-agnostic and dependency-light.',
            },
          ],
        },
      ],
    },
  },
];

export default library;
