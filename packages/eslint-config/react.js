import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { base } from './base.js';

/**
 * Frontend layers (doc 01 section 2.2): lib <- shared <- entities <- features <- app
 * Features may not reach into each other's internals.
 */
export const react = [
  ...base,
  {
    languageOptions: { globals: { ...globals.browser } },
    plugins: { boundaries, 'react-hooks': reactHooks },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'config', pattern: 'src/config', mode: 'folder' },
        { type: 'lib', pattern: 'src/lib', mode: 'folder' },
        { type: 'shared', pattern: 'src/shared', mode: 'folder' },
        { type: 'entities', pattern: 'src/entities/*', mode: 'folder', capture: ['entity'] },
        { type: 'features', pattern: 'src/features/*', mode: 'folder', capture: ['feature'] },
        { type: 'app', pattern: 'src/app', mode: 'folder' },
        { type: 'root', pattern: 'src/*.tsx', mode: 'file' },
      ],
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: ['./tsconfig.json'] },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'boundaries/no-unknown-files': 'off',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: '${file.type} is not allowed to import ${dependency.type} (doc 01 section 2.2).',
          rules: [
            { from: 'config', allow: [] },
            { from: 'lib', allow: ['config'] },
            { from: 'shared', allow: ['config', 'lib'] },
            { from: 'entities', allow: ['config', 'lib', 'shared'] },
            { from: 'features', allow: ['config', 'lib', 'shared', 'entities', 'features'] },
            { from: 'app', allow: ['config', 'lib', 'shared', 'entities', 'features'] },
            { from: 'root', allow: ['config', 'lib', 'shared', 'entities', 'features', 'app'] },
          ],
        },
      ],
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          message: 'Import ${dependency.type} through its index.ts public API, not its internals.',
          rules: [
            { target: ['features', 'entities'], allow: 'index.ts' },
            { target: ['config', 'lib', 'shared', 'app', 'root'], allow: '**' },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@repo/api/*'], message: 'Use @repo/api-contract, never backend source.' },
            { group: ['../../../*'], message: 'Use the @/ path alias instead of deep relative imports.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    rules: { 'boundaries/entry-point': 'off', 'boundaries/element-types': 'off' },
  },
];

export default react;
