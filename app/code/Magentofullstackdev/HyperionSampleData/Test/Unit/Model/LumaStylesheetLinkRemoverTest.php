<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Test\Unit\Model;

use Magento\Framework\App\Config\Storage\WriterInterface;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\DB\Adapter\AdapterInterface;
use Magento\Framework\DB\Select;
use Magentofullstackdev\HyperionSampleData\Model\LumaStylesheetLinkRemover;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class LumaStylesheetLinkRemoverTest extends TestCase
{
    private const LUMA_LINK = '<link  rel="stylesheet" type="text/css"  media="all" href="{{MEDIA_URL}}styles.css" />';

    /** @var WriterInterface&MockObject */
    private WriterInterface $writer;

    /**
     * @param array<int, array<string, mixed>> $rows
     */
    private function remover(array $rows): LumaStylesheetLinkRemover
    {
        $select = $this->createStub(Select::class);
        $select->method('from')->willReturnSelf();
        $select->method('where')->willReturnSelf();
        $connection = $this->createStub(AdapterInterface::class);
        $connection->method('select')->willReturn($select);
        $connection->method('fetchAll')->willReturn($rows);
        $resource = $this->createStub(ResourceConnection::class);
        $resource->method('getConnection')->willReturn($connection);
        $resource->method('getTableName')->willReturn('core_config_data');
        $this->writer = $this->createMock(WriterInterface::class);

        return new LumaStylesheetLinkRemover($resource, $this->writer);
    }

    public function testTheLumaLinkIsRemovedFromEveryScopeThatCarriesIt(): void
    {
        $remover = $this->remover([
            ['scope' => 'default', 'scope_id' => '0', 'value' => self::LUMA_LINK],
            ['scope' => 'stores', 'scope_id' => '2', 'value' => "<script type=\"text/javascript\">window.x=1</script>\n" . self::LUMA_LINK],
            ['scope' => 'websites', 'scope_id' => '1', 'value' => '<meta name="robots" content="index">'],
        ]);
        $saved = [];
        $this->writer->expects(self::exactly(2))->method('save')
            ->willReturnCallback(function (string $path, $value, string $scope, int $scopeId) use (&$saved): void {
                $saved[] = [$path, $value, $scope, $scopeId];
            });

        self::assertSame(2, $remover->remove());
        self::assertSame([
            ['design/head/includes', '', 'default', 0],
            ['design/head/includes', '<script type="text/javascript">window.x=1</script>', 'stores', 2],
        ], $saved, 'the link goes, the other includes of the scope stay');
    }

    public function testNothingIsWrittenWhenNoRowCarriesTheLink(): void
    {
        $remover = $this->remover([
            ['scope' => 'default', 'scope_id' => '0', 'value' => ''],
        ]);
        $this->writer->expects(self::never())->method('save');

        self::assertSame(0, $remover->remove());
    }
}
