module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
    'no-empty': 'warn',
    'no-constant-condition': 'warn',
    'no-useless-escape': 'warn',
  },
  ignorePatterns: ['node_modules/', 'dist/', 'coverage/'],
};
