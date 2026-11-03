// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * API error shapes.
 *
 * Magento's REST error body follows this convention:
 *
 *   { "message": "The email address is invalid...", "parameters": {...} }
 *
 * Some endpoints also emit `trace` (dev-mode only) and `errors` (an
 * array of per-field messages). We normalise everything into
 * `MagentoApiError` (implemented in `api/client.ts`). The interfaces
 * below describe the raw wire shapes.
 */

export interface MagentoWireError {
    message: string;
    parameters?: Record<string, string | number> | string[];
    trace?: string;
    errors?: readonly MagentoWireError[];
}
