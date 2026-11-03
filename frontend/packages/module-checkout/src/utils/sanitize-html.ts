// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Allowlist sanitizer for admin-authored rich text (payment instructions,
 * agreement copy, shipping-policy content). The implementation is shared
 * with the theme: `@magentofullstackdev/hyperion-shared/html`.
 *
 * When a consumer needs script or iframe embedding (trackers, video
 * embeds), it should add a dedicated renderer rather than extend the
 * allowlist.
 */
import { sanitizeHtml, htmlToText } from '@magentofullstackdev/hyperion-shared/html';

export function sanitiseHtml(input: string): string {
    return sanitizeHtml(input);
}

export { htmlToText };
