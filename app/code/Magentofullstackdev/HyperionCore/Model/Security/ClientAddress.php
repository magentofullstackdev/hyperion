<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Security;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\DeploymentConfig;
use Magento\Framework\App\Request\Http as HttpRequest;

/**
 * The address of the client a request really comes from, the key of its
 * rate limit bucket.
 *
 * Behind Varnish (or any reverse proxy) PHP's REMOTE_ADDR is the proxy, so
 * every visitor would share one bucket. X-Forwarded-For carries the client,
 * but the header is written by whoever sends the request: a client can put
 * anything in front of it, only the addresses appended by the proxies on
 * the way are real. The list is therefore always read from the RIGHT, where
 * the proxies write, and never from the left, where a forger does.
 *
 * With trusted proxies configured (`hyperion/security/trusted_proxies`) the
 * header counts only when the peer is one of them, and the client is the
 * rightmost address that is not a trusted proxy.
 *
 * Without configured proxies the peer decides:
 * - a public peer talks to PHP directly, the header is ignored and the peer
 *   is the client;
 * - a private, loopback or reserved peer is a local reverse proxy (Varnish,
 *   nginx, a load balancer on the internal network). The known proxies (the
 *   peer and the literal IPs of `http_cache_hosts` in env.php) are dropped
 *   from the right of the list, then AT MOST ONE undeclared hop: a private
 *   address in the peer's own /24 (IPv6: /64), when something remains to its
 *   left. That is the TLS terminator in front of Varnish. The rightmost entry
 *   left is the client, public or private; the key is the peer plus that
 *   address, a bucket key rather than an IP. A forged prefix sits to the left
 *   of the client and is not reached, whichever range the client is in.
 *
 * This is a guess at the topology, not a proof of it. Two undeclared hops
 * leave the second one as the client, so everybody behind it shares a bucket.
 * A private client talking straight to an exposed Varnish looks like a hop
 * and can choose its bucket with a forged prefix. Only the configured list
 * gives a real guarantee: set it in production.
 */
class ClientAddress
{
    public const XML_PATH_TRUSTED_PROXIES = 'hyperion/security/trusted_proxies';
    private const CACHE_HOSTS_KEY = 'http_cache_hosts';

    public function __construct(
        private readonly HttpRequest $request,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly DeploymentConfig $deploymentConfig
    ) {
    }

    /**
     * @return string The client IP, or `peer/forwarded` behind an unconfigured private proxy
     *                (a bucket key rather than an IP), or '' when no client is known.
     */
    public function get(): string
    {
        $remote = $this->validIp((string) $this->request->getServer('REMOTE_ADDR', ''));
        if ($remote === '') {
            return '';
        }
        $forwarded = (string) $this->request->getServer('HTTP_X_FORWARDED_FOR', '');
        $chain = array_values(array_filter(array_map(
            fn (string $ip): string => $this->validIp(trim($ip)),
            explode(',', $forwarded)
        )));
        $trusted = $this->trustedProxies();
        if ($trusted !== []) {
            return $this->behindTrustedProxies($remote, $chain, $trusted);
        }
        if ($this->isPublic($remote)) {
            // PHP faces the internet itself: nobody on the way could have written the header.
            return $remote;
        }

        return $this->behindUnconfiguredProxy($remote, $chain);
    }

    /**
     * @param string[] $chain
     * @param string[] $trusted
     */
    private function behindTrustedProxies(string $remote, array $chain, array $trusted): string
    {
        if (!in_array($remote, $trusted, true)) {
            return $remote;
        }
        for ($i = count($chain) - 1; $i >= 0; $i--) {
            if (!in_array($chain[$i], $trusted, true)) {
                return $chain[$i];
            }
        }

        return $remote;
    }

    /**
     * The peer is a private address and no proxy is configured: drop the known proxies
     * from the right, then at most one undeclared hop next to the peer, and the rightmost
     * entry left is the client. Nothing left: the request came from the proxies themselves.
     *
     * @param string[] $chain
     */
    private function behindUnconfiguredProxy(string $remote, array $chain): string
    {
        $proxies = array_merge([$remote], $this->cacheHostAddresses());
        while ($chain !== [] && in_array($chain[count($chain) - 1], $proxies, true)) {
            array_pop($chain);
        }
        if (count($chain) > 1 && $this->isHopNextTo($remote, $chain[count($chain) - 1])) {
            array_pop($chain);
        }

        return $chain === [] ? $remote : $remote . '/' . $chain[count($chain) - 1];
    }

    /**
     * A private address in the peer's /24 (IPv6: /64).
     */
    private function isHopNextTo(string $remote, string $candidate): bool
    {
        if ($this->isPublic($candidate)) {
            return false;
        }
        $peer = (string) inet_pton($remote);
        $hop = (string) inet_pton($candidate);
        $prefix = strlen($peer) === 4 ? 3 : 8;

        return strlen($peer) === strlen($hop) && strncmp($peer, $hop, $prefix) === 0;
    }

    /**
     * @return string[]
     */
    public function trustedProxies(): array
    {
        $raw = (string) $this->scopeConfig->getValue(self::XML_PATH_TRUSTED_PROXIES);
        $list = [];
        foreach (preg_split('/[\s,]+/', $raw) ?: [] as $entry) {
            $ip = $this->validIp($entry);
            if ($ip !== '') {
                $list[] = $ip;
            }
        }

        return array_values(array_unique($list));
    }

    /**
     * The literal IP addresses of `http_cache_hosts` (hostnames are not resolved).
     *
     * @return string[]
     */
    private function cacheHostAddresses(): array
    {
        $hosts = $this->deploymentConfig->get(self::CACHE_HOSTS_KEY);
        $list = [];
        foreach (is_array($hosts) ? $hosts : [] as $entry) {
            $ip = $this->validIp(trim((string) (is_array($entry) ? ($entry['host'] ?? '') : $entry)));
            if ($ip !== '') {
                $list[] = $ip;
            }
        }

        return array_values(array_unique($list));
    }

    private function isPublic(string $ip): bool
    {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }

    private function validIp(string $candidate): string
    {
        return filter_var($candidate, FILTER_VALIDATE_IP) === false ? '' : $candidate;
    }
}
