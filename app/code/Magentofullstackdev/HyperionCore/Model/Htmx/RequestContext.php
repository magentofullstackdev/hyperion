<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Url\HostChecker;

/**
 * What the current request says about the page it was sent from.
 *
 * htmx marks its requests with `HX-Request: true` and carries the URL of the
 * document that issued them in `HX-Current-URL`. A fragment rendered for such
 * a request (the header state, the mini-cart) must not treat its own URL as
 * "the current page": core's Customer\Model\Url did exactly that for the
 * Sign in link of the account menu and sent the customer to
 * /hyperion/header/state after the login.
 */
class RequestContext
{
    private const HEADER_REQUEST = 'HX-Request';
    private const HEADER_CURRENT_URL = 'HX-Current-URL';

    public function __construct(
        private readonly HttpRequest $request,
        private readonly HostChecker $hostChecker
    ) {
    }

    public function isHtmx(): bool
    {
        return strtolower($this->header(self::HEADER_REQUEST)) === 'true';
    }

    /**
     * The page the htmx request was issued from, only when it belongs to this
     * installation (the header is client supplied).
     */
    public function getCurrentUrl(): ?string
    {
        $url = $this->header(self::HEADER_CURRENT_URL);
        if ($url === '' || !preg_match('#^https?://#i', $url)) {
            return null;
        }
        return $this->hostChecker->isOwnOrigin($url) ? $url : null;
    }

    private function header(string $name): string
    {
        $value = $this->request->getHeader($name);
        return is_string($value) ? trim($value) : '';
    }
}
