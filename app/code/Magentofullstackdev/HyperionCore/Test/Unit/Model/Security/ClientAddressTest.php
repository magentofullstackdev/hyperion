<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Security;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\DeploymentConfig;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magentofullstackdev\HyperionCore\Model\Security\ClientAddress;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCore\Model\Security\ClientAddress
 */
class ClientAddressTest extends TestCase
{
    /**
     * @return array<string, array{string, string, string, string, 4?: array<int, array<string, mixed>|string>}>
     */
    public static function addressProvider(): array
    {
        return [
            // ---- configured trusted proxies
            'untrusted peer: header ignored even when proxies are configured' => ['203.0.113.9', '198.51.100.1', '10.0.0.2', '203.0.113.9'],
            'trusted peer: rightmost address that is not a proxy' => ['10.0.0.2', '198.51.100.1, 10.0.0.3', '10.0.0.2, 10.0.0.3', '198.51.100.1'],
            'trusted peer, forged left part' => ['10.0.0.2', '1.2.3.4, 198.51.100.1, 10.0.0.3', "10.0.0.2\n10.0.0.3", '198.51.100.1'],
            'trusted peer without a header: the peer' => ['10.0.0.2', '', '10.0.0.2', '10.0.0.2'],
            'garbage in the header is dropped' => ['10.0.0.2', 'not-an-ip, 198.51.100.7', '10.0.0.2', '198.51.100.7'],
            'invalid REMOTE_ADDR: unknown client' => ['', '198.51.100.1', '', ''],
            // ---- no trusted proxies, public peer: PHP faces the internet, the header is a forgery
            'public peer, no proxies: a forged header is ignored' => ['203.0.113.9', '198.51.100.1, 10.0.0.3', '', '203.0.113.9'],
            'public peer, no proxies, no header: the peer' => ['203.0.113.9', '', '', '203.0.113.9'],
            // ---- no trusted proxies, private peer: a local reverse proxy appended the client
            'private peer: forged prefix, real client, internal nginx' => ['10.10.50.4', '198.51.100.99, 203.0.113.10, 10.10.50.10', '', '10.10.50.4/203.0.113.10'],
            'private peer: a plain chain of one public client' => ['10.0.0.2', '198.51.100.1', '', '10.0.0.2/198.51.100.1'],
            'private peer: a forged victim in front of the forger lands in the forger\'s bucket' => ['10.10.50.4', '203.0.113.50, 198.51.100.1, 10.10.50.10', '', '10.10.50.4/198.51.100.1'],
            'private peer, empty chain: the peer' => ['10.0.0.2', '', '', '10.0.0.2'],
            'loopback peer: the public forwarded address' => ['127.0.0.1', '203.0.113.7, 127.0.0.1', '', '127.0.0.1/203.0.113.7'],
            'IPv6 loopback peer: the public forwarded address' => ['::1', '2001:db8::7', '', '::1/2001:db8::7'],
            'IPv6 private peer behind a private hop' => ['fd00::4', '2001:db8::7, fd00::10', '', 'fd00::4/2001:db8::7'],
            // ---- no trusted proxies, private peer, every forwarded address private (local network, Docker)
            'all private: the rightmost address that is not the peer' => ['10.10.50.4', '10.10.50.1, 10.10.50.4', '', '10.10.50.4/10.10.50.1'],
            'all private: cache hosts are proxies too (literal IPs, hostnames ignored)' => ['10.10.50.4', '10.10.50.1, 10.10.50.10, 10.10.50.4', '', '10.10.50.4/10.10.50.1', [['host' => '10.10.50.10', 'port' => 80], ['host' => 'varnish', 'port' => 80], ['host' => '10.10.50.4', 'port' => 80]]],
            'all private: cache hosts given as bare strings' => ['10.10.50.4', '10.10.50.1, 10.10.50.10', '', '10.10.50.4/10.10.50.1', ['10.10.50.10']],
            'all private: only proxies in the chain, the request came from them' => ['10.10.50.4', '10.10.50.10', '', '10.10.50.4', [['host' => '10.10.50.10', 'port' => 80]]],
            'all private: the chain is just the peer' => ['127.0.0.1', '127.0.0.1', '', '127.0.0.1'],
            'all private: IPv6 unique local addresses' => ['::1', 'fd00::5, fd00::10', '', '::1/fd00::5', [['host' => 'fd00::10', 'port' => 80]]],
            // ---- at most one undeclared hop in the peer's subnet
            'private client behind a hop: a public forged prefix is not reached' => ['10.0.0.4', '8.8.8.8, 10.0.0.50, 10.0.0.2', '', '10.0.0.4/10.0.0.50'],
            'private client behind a hop: another forged prefix, the same bucket' => ['10.0.0.4', '1.1.1.1, 10.0.0.50, 10.0.0.2', '', '10.0.0.4/10.0.0.50'],
            'public client in the same position: first prefix' => ['10.0.0.4', '8.8.8.8, 9.9.9.9, 10.0.0.2', '', '10.0.0.4/9.9.9.9'],
            'public client in the same position: second prefix' => ['10.0.0.4', '1.1.1.1, 9.9.9.9, 10.0.0.2', '', '10.0.0.4/9.9.9.9'],
            'Varnish exposed directly, public client: forged prefix not reached' => ['10.0.0.4', '8.8.8.8, 9.9.9.9', '', '10.0.0.4/9.9.9.9'],
            'two undeclared hops: the second one, never the forged prefix' => ['10.0.0.4', '8.8.8.8, 10.0.0.50, 10.0.0.2, 10.0.0.3', '', '10.0.0.4/10.0.0.2'],
            'a private entry outside the peer subnet is the client, not a hop' => ['10.0.0.4', '8.8.8.8, 10.0.1.50', '', '10.0.0.4/10.0.1.50'],
            'a declared cache host does not use up the one undeclared hop' => ['10.0.0.4', '8.8.8.8, 10.0.0.50, 10.0.0.2, 10.0.9.9', '', '10.0.0.4/10.0.0.50', [['host' => '10.0.9.9', 'port' => 80]]],
            'IPv6 hop in the peer /64, forged prefix not reached' => ['fd00::4', '2001:db8::1, fd00:1::50, fd00::10', '', 'fd00::4/fd00:1::50'],
            'mixed address families are never one subnet' => ['10.0.0.4', '8.8.8.8, fd00::50', '', '10.0.0.4/fd00::50'],
        ];
    }

    /**
     * @param array<int, array<string, mixed>|string> $cacheHosts
     * @dataProvider addressProvider
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('addressProvider')]
    public function testResolvesTheClientAddress(string $remote, string $forwarded, string $proxies, string $expected, array $cacheHosts = []): void
    {
        self::assertSame($expected, $this->clientAddress($remote, $forwarded, $proxies, $cacheHosts)->get());
    }

    public function testTwoForgersOfTheSameVictimGetTheirOwnBucketsNeverTheVictims(): void
    {
        $victim = '203.0.113.50';
        $one = $this->clientAddress('10.10.50.4', "$victim, 198.51.100.1, 10.10.50.10", '')->get();
        $two = $this->clientAddress('10.10.50.4', "$victim, 198.51.100.2, 10.10.50.10", '')->get();
        $honest = $this->clientAddress('10.10.50.4', "$victim, 10.10.50.10", '')->get();

        self::assertSame('10.10.50.4/198.51.100.1', $one);
        self::assertSame('10.10.50.4/198.51.100.2', $two);
        self::assertSame('10.10.50.4/' . $victim, $honest, 'the victim itself keeps its own bucket');
        self::assertNotSame($honest, $one);
        self::assertNotSame($honest, $two);
        self::assertNotSame($one, $two);
    }

    public function testARotatingForgedHeaderNeverLeavesTheForgersBucket(): void
    {
        $keys = [];
        foreach (['1.1.1.1', '2.2.2.2', '3.3.3.3'] as $forged) {
            $keys[] = $this->clientAddress('10.10.50.4', "$forged, 198.51.100.1, 10.10.50.10", '')->get();
        }

        self::assertSame(['10.10.50.4/198.51.100.1'], array_values(array_unique($keys)));
    }

    public function testTrustedProxiesAreParsedFromCommasAndWhitespace(): void
    {
        self::assertSame(['10.0.0.2', '10.0.0.3'], $this->clientAddress('10.0.0.2', '', "10.0.0.2, bogus\n10.0.0.3 10.0.0.2")->trustedProxies());
    }

    /**
     * @param array<int, array<string, mixed>|string> $cacheHosts
     */
    private function clientAddress(string $remote, string $forwarded, string $proxies, array $cacheHosts = []): ClientAddress
    {
        $request = $this->createStub(HttpRequest::class);
        $request->method('getServer')->willReturnCallback(
            static fn (string $name, $default = null) => match ($name) {
                'REMOTE_ADDR' => $remote,
                'HTTP_X_FORWARDED_FOR' => $forwarded,
                default => $default,
            }
        );
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn($proxies);
        $deploymentConfig = $this->createStub(DeploymentConfig::class);
        $deploymentConfig->method('get')->willReturn($cacheHosts === [] ? null : $cacheHosts);

        return new ClientAddress($request, $scopeConfig, $deploymentConfig);
    }
}
