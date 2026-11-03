<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\App\Response;

use Magento\Framework\App\Response\Http as HttpResponse;

/**
 * Flags responses that contain `<esi:include>` with `X-Esi: 1` so the
 * Varnish VCL enables ESI parsing only for those objects.
 *
 * Hooked on sendResponse(): the body is complete at that point. (Hooking
 * setPublicHeaders() does not work, Magento calls it from the layout
 * generation plugin before any block has rendered, so the body is empty
 * and the header never appears.)
 */
class EsiMarkerPlugin
{
    private const HEADER = 'X-Esi';

    /**
     * @return array<int, mixed>
     */
    public function beforeSendResponse(HttpResponse $subject): array
    {
        $content = $subject->getContent();
        if (is_string($content) && $content !== '' && str_contains($content, '<esi:include')) {
            $subject->setHeader(self::HEADER, '1', true);
        }
        return [];
    }
}
