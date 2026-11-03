// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/*
 * Shared ESLint configuration of the three frontend packages. Kept on the
 * "recommended" rule sets without type-aware rules so it runs in seconds
 * in CI; TypeScript strictness comes from tsconfig.base.json.
 */
module.exports = {
    root: true,
    env: { browser: true, es2022: true, node: true },
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    extends: ['eslint:recommended'],
    ignorePatterns: ['node_modules/', '**/web/assets/', '**/dist/', '*.timestamp-*.mjs'],
    rules: {
        'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    overrides: [
        {
            files: ['**/*.ts'],
            parser: '@typescript-eslint/parser',
            plugins: ['@typescript-eslint'],
            extends: ['plugin:@typescript-eslint/recommended'],
            rules: {
                '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
                // Component modules are imported for their side effect (custom
                // element registration); a type-only import would drop it.
                '@typescript-eslint/consistent-type-imports': 'off',
                '@typescript-eslint/no-this-alias': 'off',
            },
        },
        {
            files: ['e2e/**', '**/__tests__/**', '**/*.test.*', '**/vitest.config.*', '**/vite.config.*', 'scripts/**', 'bin/**'],
            rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
        },
    ],
};
