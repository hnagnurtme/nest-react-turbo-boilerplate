import base from '@repo/eslint-config/base';

// This package is mostly generated code (src/generated/**); keep linting light.
export default [
  ...base,
  { ignores: ['src/generated/**'] },
];
