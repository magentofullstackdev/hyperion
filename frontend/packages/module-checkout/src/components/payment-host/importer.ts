// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Registers the import of the payment host chunk (`mount.ts`) with
 * `host.ts`. Imported for its side effect by the payment components and
 * the sections loaded before the mount, so the `import()` sits in the
 * application chunk: the build then knows that chunk is loaded wherever the
 * host chunk loads, and keeps the code they share in it.
 */
import { registerHostImporter } from './host.js';

registerHostImporter(() => import('./mount.js'));
