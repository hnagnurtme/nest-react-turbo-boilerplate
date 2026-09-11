import boundaries from 'eslint-plugin-boundaries';
import { base } from './base.js';

/**
 * The five backend layers (doc 01 section 2.2). Read left to right:
 * config <- common <- core <- integrations <- modules
 * A layer may only import layers to its left.
 */
export const backend = [
  ...base,
  {
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'config', pattern: 'src/config', mode: 'folder' },
        { type: 'common', pattern: 'src/common', mode: 'folder' },
        { type: 'core', pattern: 'src/core', mode: 'folder' },
        { type: 'integrations', pattern: 'src/integrations/*', mode: 'folder', capture: ['adapter'] },
        { type: 'modules', pattern: 'src/modules/*', mode: 'folder', capture: ['module'] },
        { type: 'root', pattern: 'src/*.ts', mode: 'file' },
      ],
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: ['./tsconfig.json'] },
      },
    },
    rules: {
      'boundaries/no-unknown-files': 'off',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: '${file.type} is not allowed to import ${dependency.type} (doc 01 section 2.2).',
          rules: [
            { from: 'config', allow: [] },
            { from: 'common', allow: ['config'] },
            { from: 'core', allow: ['config', 'common'] },
            { from: 'integrations', allow: ['config', 'common', 'core'] },
            { from: 'modules', allow: ['config', 'common', 'core', 'integrations', 'modules'] },
            { from: 'root', allow: ['config', 'common', 'core', 'integrations', 'modules'] },
          ],
        },
      ],
      // A module may only be entered through its public API.
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          message: 'Import ${dependency.type} through its index.ts public API, not its internals.',
          rules: [
            { target: ['modules', 'integrations'], allow: 'index.ts' },
            { target: ['config', 'common', 'core', 'root'], allow: '**' },
          ],
        },
      ],
    },
  },
  {
    // Tests may reach into internals of the element under test.
    files: ['**/*.spec.ts', '**/*.test.ts', '**/__tests__/**', 'test/**'],
    rules: { 'boundaries/entry-point': 'off', 'boundaries/element-types': 'off' },
  },
];

export default backend;
