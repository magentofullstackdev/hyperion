// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Global setup for Hyperion Vitest component tests.
//
// - Silence Lit's dev-mode warnings so fast-check output stays readable.
// - Provide a small helper for building a fresh fixture inside each test
//   without needing @open-wc/testing (which targets Web Test Runner, not
//   Vitest).
// - Clear the document body between tests so registered custom elements are
//   not leaked across fast-check iterations.
import { afterEach, beforeAll } from 'vitest';

beforeAll(() => {
    // Lit's "dev mode" warning is noisy in test output.
    globalThis.litIssuedWarnings = new Set();
});

afterEach(() => {
    document.body.innerHTML = '';
});
