# PageBuilder

Hyperion renders every PageBuilder content type with the settings configured
in the admin, without RequireJS, jQuery, slick or jarallax. Nothing changes
in how content is authored or stored.

## How it works

PageBuilder stores plain HTML marked with `data-content-type`,
`data-appearance` and `data-element`. Every setting that is a style (margins,
paddings, alignment, min-height, borders, colors, backgrounds, column widths,
"hide on mobile") is already written by the admin editor as CSS in the
content (`#html-body [data-pb-style=ID] {...}`, mobile values at
`max-width: 767px`). Two things a theme without a parent has to supply:

1. Core's structural stylesheet, which Luma inherits from `Magento_PageBuilder`'s
   LESS. Hyperion ports it rule for rule, with the same selectors and the
   same 767 / 768 px breakpoint, in
   `frontend/packages/theme-default/src/css/source/_pagebuilder.css`
   (compiled into the theme CSS). Same selectors means the admin-generated
   rules always win. It also restores what Tailwind's preflight removes
   inside PageBuilder content (heading sizes, list markers, blockquotes,
   tables, `<hr>`).
2. Replacements for core's RequireJS widgets that read the same `data-*`
   attributes: `src/js/lib/pagebuilder.js` (loaded by the theme entry only
   when the page contains `[data-content-type]`, re-run after HTMX swaps),
   `<hyperion-slider>` and `<hyperion-carousel>`.

`HyperionCms` adds renderers on the PageBuilder template filter: the slider
is swapped for `<hyperion-slider>` keeping every `data-*` attribute, and the
map renderer puts the API key and style on the element so nothing map-related
loads on pages without a map. Product and category HTML attributes
(descriptions) go through `Catalog\Helper\Output`, so `{{media}}` and widget
directives and PageBuilder background images render in product descriptions.

## Supported content types

| Content type | Settings honored | Notes |
|---|---|---|
| Row | contained, full width, full bleed; background color / image, parallax, video background; mobile background | Parallax is `background-attachment: fixed` (no script; `data-parallax-speed` is ignored; normal background on iOS as in core). Video backgrounds: YouTube (privacy-enhanced host), Vimeo, mp4; always lazy (IntersectionObserver), fallback image, overlay, `prefers-reduced-motion` |
| Column line / Column | widths, vertical alignment appearances, mobile stacking, min-height | |
| Text, Heading, HTML Code, Divider | all | |
| Buttons | `data-same-width` (equal-width groups), button styles | |
| Image | desktop / mobile image (`.pagebuilder-mobile-hidden` / `-only`) | |
| Video | 16:9 box | |
| Banner | 4 appearances, `data-show-overlay`, `data-show-button`, `data-overlay-color` (hover states are pure CSS) | |
| Slider / Slide | `data-autoplay`, `data-autoplay-speed`, `data-fade`, `data-infinite-loop`, `data-show-arrows`, `data-show-dots`, min-height | Dots, fade mode, arrows disabled at the ends without loop, `inert` on off-screen slides, no layout jump before the element upgrades |
| Tabs / Tab item | `data-active-tab`, URL hash, keyboard (arrow keys), ARIA | Core markup is kept as stored so every generated style applies; the first tab is shown until the script runs |
| Map | `data-locations`, `data-show-controls`, markers and info windows | Google Maps JS API loaded lazily when `cms/pagebuilder/google_maps_api_key` is set; without a key a keyless Google embed of the first location replaces core's error box |
| Block | | Dynamic Blocks are Adobe Commerce only and not covered |
| Products (grid) | as configured | Renders the Hyperion product cards |
| Products (carousel) | `data-autoplay`, `data-autoplay-speed`, `data-infinite-loop`, `data-show-arrows`, `data-show-dots`, `data-carousel-mode="continuous"`, `data-center-padding` | Theme template `Magento_PageBuilder::catalog/product/widget/content/carousel.phtml`. "Infinite loop" wraps at the ends instead of a cloned endless track; continuous mode is side padding with neighbors peeking in |
| Widget (Mage-OS) | | Rendered through the normal CMS filter |
| Hidden elements ("Hide" per breakpoint) | | Generated CSS |

Verified with a page holding every content type in varied settings (20 rows,
6 banners, 2 sliders, 2 tab sets, 2 maps, 3 product lists, video, block,
HTML code, dividers, buttons, images, hidden elements) at 1440 and 390 px
on the three tested platforms, including hover overlays, tab switching by
click and keyboard, slider autoplay / fade / loop, carousel modes and
same-width button groups. The maintainers keep a generator script for this
"kitchen sink" page in their tooling; it is not part of the packages.

## Full-width page layouts

PageBuilder's `cms-full-width`, `category-full-width` and `product-full-width`
layouts expect the gutters on `<main>`. In Hyperion the gutters live on the
`columns` container, so the theme ships its own versions:

| Layout | File in the theme | Effect |
|---|---|---|
| `cms-full-width` | `Magento_PageBuilder/page_layout/cms-full-width.xml` | `columns` loses the container; contained rows and `.row-full-width-inner` get the container width from the CSS, full-bleed rows span the viewport |
| `product-full-width` | `Magento_PageBuilder/page_layout/override/base/product-full-width.xml` | replaces core's file (core rebuilds the Luma product page there and produced a second unstyled copy of description and reviews). Gallery, info and tabs stay in the container; the description and PageBuilder attributes render full width between them |
| `category-full-width` | `Magento_PageBuilder/page_layout/override/base/category-full-width.xml` | title and image keep the container; description and CMS block span the page; layered navigation and the product grid stay in the container |

The page title wrapper (`Magento_Theme::html/title.phtml`) carries the site
container so titles align with breadcrumbs on every layout.

## Where the CSS lives

- Structural rules: `frontend/packages/theme-default/src/css/source/_pagebuilder.css`.
  Do not add opinionated spacing there: the admin settings are meant to win.
- The theme's `<body>` has `id="html-body"`, which the generated
  `#html-body [data-pb-style]` rules require. Keep it in any override of
  `Magento_Theme::root.phtml`.
- The CSP whitelist for the map and video hosts is in
  `HyperionCms/etc/csp_whitelist.xml`.
