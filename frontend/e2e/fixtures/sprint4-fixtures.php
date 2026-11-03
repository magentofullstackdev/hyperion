<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Fixtures for the fallback pages live check (e2e/pw-fallback-pages.mjs). Runs inside php-fpm as www-data:
//   php /tmp/sprint4-fixtures.php /var/www/html documents <increment id>   invoices the order, ships it with a tracking
//                                                                         number and refunds one unit; prints JSON with
//                                                                         the entity ids and the tracking popup URL
//   php /tmp/sprint4-fixtures.php /var/www/html page                      creates the CMS page /hyperion-fallback-check
//                                                                         with the Orders and Returns widget
//   php /tmp/sprint4-fixtures.php /var/www/html remove                    deletes the CMS page
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$action = $argv[2] ?? 'page';
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('frontend');
$identifier = 'hyperion-fallback-check';
$pageRepo = $om->get(\Magento\Cms\Api\PageRepositoryInterface::class);
$criteriaBuilder = $om->get(\Magento\Framework\Api\SearchCriteriaBuilder::class);

if ($action === 'remove') {
    foreach ($pageRepo->getList($criteriaBuilder->addFilter('identifier', $identifier)->create())->getItems() as $page) {
        $pageRepo->delete($page);
    }
    echo "page removed\n";
    exit(0);
}
if ($action === 'page') {
    $existing = $pageRepo->getList($criteriaBuilder->addFilter('identifier', $identifier)->create())->getItems();
    $page = $existing ? reset($existing) : $om->get(\Magento\Cms\Model\PageFactory::class)->create();
    $page->setIdentifier($identifier)->setTitle('Hyperion fallback check')->setPageLayout('1column')
        ->setStores([0])->setIsActive(true)
        ->setContent('<p>Hyperion e2e widget.</p>{{widget type="Magento\\Sales\\Block\\Widget\\Guest\\Form" template="widget/guest/form.phtml"}}');
    $pageRepo->save($page);
    echo "page /$identifier ready\n";
    exit(0);
}

$incrementId = $argv[3] ?? '';
$orders = $om->get(\Magento\Sales\Api\OrderRepositoryInterface::class)
    ->getList($criteriaBuilder->addFilter('increment_id', $incrementId)->create())->getItems();
$order = reset($orders);
if (!$order) {
    echo json_encode(['error' => "order $incrementId not found"]) . "\n";
    exit(1);
}
$out = ['order_id' => (int) $order->getId()];
$transactionFactory = $om->get(\Magento\Framework\DB\TransactionFactory::class);

if ($order->canInvoice()) {
    $invoice = $om->get(\Magento\Sales\Model\Service\InvoiceService::class)->prepareInvoice($order);
    $invoice->setRequestedCaptureCase(\Magento\Sales\Model\Order\Invoice::CAPTURE_OFFLINE);
    $invoice->register();
    $invoice->getOrder()->setIsInProcess(true);
    $transactionFactory->create()->addObject($invoice)->addObject($invoice->getOrder())->save();
}
$invoices = $order->getInvoiceCollection();
$out['invoice_id'] = (int) ($invoices->getFirstItem()->getId() ?: 0);

if ($order->canShip()) {
    $convert = $om->get(\Magento\Sales\Model\Convert\Order::class);
    $shipment = $convert->toShipment($order);
    foreach ($order->getAllItems() as $orderItem) {
        if (!$orderItem->getQtyToShip() || $orderItem->getIsVirtual()) {
            continue;
        }
        $shipment->addItem($convert->itemToShipmentItem($orderItem)->setQty($orderItem->getQtyToShip()));
    }
    $shipment->register();
    $shipment->addTrack(
        $om->create(\Magento\Sales\Model\Order\Shipment\Track::class)
            ->setNumber('HYPE2ETRACK')->setCarrierCode('custom')->setTitle('Hyperion e2e Carrier')
    );
    $shipment->getOrder()->setIsInProcess(true);
    $transactionFactory->create()->addObject($shipment)->addObject($shipment->getOrder())->save();
}
$shipment = $order->getShipmentsCollection()->getFirstItem();
$out['shipment_id'] = (int) ($shipment->getId() ?: 0);
$track = $shipment->getId() ? $shipment->getTracksCollection()->getFirstItem() : null;
$out['tracking_url'] = $track && $track->getId()
    ? $om->get(\Magento\Shipping\Helper\Data::class)->getTrackingPopupUrlBySalesModel($track)
    : '';

if ($order->canCreditmemo()) {
    $qtys = [];
    foreach ($order->getAllVisibleItems() as $orderItem) {
        $qtys[(int) $orderItem->getId()] = 1;
        break;
    }
    $creditmemo = $om->get(\Magento\Sales\Model\Order\CreditmemoFactory::class)
        ->createByOrder($order, ['qtys' => $qtys, 'shipping_amount' => 0, 'adjustment_positive' => 0, 'adjustment_negative' => 0]);
    $om->get(\Magento\Sales\Model\Service\CreditmemoService::class)->refund($creditmemo, true);
}
$out['creditmemo_id'] = (int) ($order->getCreditmemosCollection()->getFirstItem()->getId() ?: 0);
echo json_encode($out) . "\n";
