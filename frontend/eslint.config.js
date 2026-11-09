// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/*
 * Shared ESLint configuration of the three frontend packages and the e2e
 * scripts. Kept on the "recommended" rule sets without type-aware rules so
 * it runs in seconds in CI; TypeScript strictness comes from
 * tsconfig.base.json. ESLint finds this file by walking up from each linted
 * file, so the per-package lint scripts need no --config flag.
 */
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    {
        // Patterns are relative to this file; the prefix reaches every package.
        ignores: ['**/node_modules/', '**/web/assets/', '**/dist/', '**/*.timestamp-*.mjs'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.node },
        },
        rules: {
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            // An unused catch binding is named with a leading underscore.
            'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['**/*.ts'],
        extends: [tseslint.configs.recommended],
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            // Component modules are imported for their side effect (custom
            // element registration); a type-only import would drop it.
            '@typescript-eslint/consistent-type-imports': 'off',
            '@typescript-eslint/no-this-alias': 'off',
        },
    },
    {
        files: [
            '**/e2e/**',
            '**/__tests__/**',
            '**/*.test.*',
            '**/vitest.config.*',
            '**/vite.config.*',
            '**/scripts/**',
            '**/bin/**',
        ],
        rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
    },
]);
