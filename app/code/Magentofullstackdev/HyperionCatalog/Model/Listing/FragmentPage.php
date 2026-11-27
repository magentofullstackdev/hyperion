<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model\Listing;

use Magento\Framework\App\ViewInterface;
use Magento\Framework\View\Result\Page;
use Magento\Framework\View\Result\PageFactory;

/**
 * The page of a listing fragment (category filter, search results): only the
 * fragment handle, without `default`.
 *
 * Every result page binds its own builder to the ONE shared layout, and core's
 * `App\View` creates a page in its constructor. When
 * `App\View` is first needed while the grid renders (the swatch renderer of
 * a tile depends on `CurrentCustomer`, which depends on it), its page
 * replaces the fragment's builder: the next layout read builds the layout
 * again, a new toolbar block without the product collection takes the place
 * of the configured one and the grid fails. The fragment controllers
 * implement ActionInterface directly, so nothing creates `App\View` before
 * them: this class takes it as a dependency, so it exists before the
 * fragment page and the fragment's builder is the last one bound.
 */
class FragmentPage
{
    /**
     * @param PageFactory $pageFactory
     * @param ViewInterface $view created here only so that it exists before the fragment page
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function __construct( // @phpstan-ignore constructor.unusedParameter
        private readonly PageFactory $pageFactory,
        ViewInterface $view
    ) {
    }

    /**
     * A page with the given handle and no default handle, its layout initialized.
     *
     * @param string $handle
     * @return Page
     */
    public function create(string $handle): Page
    {
        $page = $this->pageFactory->create(false, ['load_default' => false]);
        $page->addHandle($handle);
        $page->initLayout();

        return $page;
    }
}
