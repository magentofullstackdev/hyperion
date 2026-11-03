// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { installListingFilters } from '../listing-filters.js';

const nav = ({ chips = [], cards = [] } = {}) => `
<div id="hyperion-layered-nav" data-hyperion-layered-nav>
  <section>
    <div id="hyperion-active-filters">
      ${chips.map((c) => `<a href="#" data-hyperion-filter="${c}" id="chip-${c}">Remove ${c}</a>`).join('')}
    </div>
    <hyperion-filter-accordion>
      ${cards.map(([key, open]) => `<details data-hyperion-filter="${key}" id="card-${key}" ${open ? 'open' : ''}><summary id="summary-${key}">${key}</summary><ul><li><a href="#" id="option-${key}">${key} option</a></li></ul></details>`).join('')}
    </hyperion-filter-accordion>
  </section>
</div>`;

const parse = (html) => {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
};

// What htmx does for an out of band outerHTML swap: oobBeforeSwap on the
// target with the incoming element as `fragment`, the replacement, then
// oobAfterSwap on the new element.
const oobSwap = (html) => {
    const target = document.getElementById('hyperion-layered-nav');
    const fragment = parse(html);
    target.dispatchEvent(new CustomEvent('htmx:oobBeforeSwap', { bubbles: true, detail: { shouldSwap: true, target, fragment } }));
    target.replaceWith(fragment);
    fragment.dispatchEvent(new CustomEvent('htmx:oobAfterSwap', { bubbles: true, detail: { shouldSwap: true, target, fragment } }));
    return fragment;
};

describe('listing-filters', () => {
    let uninstall;
    beforeEach(() => {
        document.body.innerHTML = `<a id="elsewhere" href="#">x</a>${nav({ cards: [['price', false], ['color', true], ['size', false]] })}`;
        uninstall = installListingFilters(document);
    });
    afterEach(() => {
        uninstall();
        document.body.innerHTML = '';
    });

    test('the open cards of the page survive the swap, the server default does not win', () => {
        const next = oobSwap(nav({ chips: ['color'], cards: [['price', true], ['color', false], ['size', false]] }));
        expect(next.querySelector('#card-price').open).toBe(false);
        expect(next.querySelector('#card-color').open).toBe(true);
        expect(next.querySelector('#card-size').open).toBe(false);
    });

    test('a card new to the page stays closed, a card gone from the page is dropped, an open card survives', () => {
        // Color (open on the page) survives in the fragment: nothing else opens.
        const next = oobSwap(nav({ cards: [['price', true], ['material', true], ['color', false]] }));
        expect(next.querySelector('#card-price').open).toBe(false);
        expect(next.querySelector('#card-material').open).toBe(false);
        expect(next.querySelector('#card-color').open).toBe(true);
    });

    test('the only open card was the applied filter and leaves the list: the server defaults stand', () => {
        // Color was open and a colour was applied by mouse (the link is focused by the click): the
        // fragment has no Color card any more and the server opens its first card (Price).
        document.getElementById('option-color').focus();
        const next = oobSwap(nav({ chips: ['color'], cards: [['price', true], ['size', false]] }));
        expect(next.querySelector('#card-price').open).toBe(true);
        expect(next.querySelector('#card-size').open).toBe(false);
    });

    test('with no open card to carry over and no applied filter card, the server defaults stand', () => {
        document.getElementById('hyperion-layered-nav').outerHTML = nav({ cards: [['price', false], ['size', false]] });
        const next = oobSwap(nav({ cards: [['price', true], ['size', false], ['material', false]] }));
        expect(next.querySelector('#card-price').open).toBe(true);
        expect(next.querySelector('#card-material').open).toBe(false);
    });

    test('a chip removed brings its card back open when no other card was open', () => {
        document.getElementById('hyperion-layered-nav').outerHTML = nav({ chips: ['color'], cards: [['price', false], ['size', false]] });
        document.getElementById('chip-color').focus();
        const next = oobSwap(nav({ cards: [['price', true], ['color', false], ['size', false]] }));
        expect(next.querySelector('#card-color').open).toBe(true);
        expect(next.querySelector('#card-price').open).toBe(false);
    });

    test('an empty navigation on the page leaves the server defaults alone', () => {
        document.getElementById('hyperion-layered-nav').outerHTML = nav();
        const next = oobSwap(nav({ cards: [['price', true]] }));
        expect(next.querySelector('#card-price').open).toBe(true);
    });

    test('a filter option activated by keyboard hands the focus to the chip of that filter', () => {
        document.getElementById('option-color').focus();
        const next = oobSwap(nav({ chips: ['color'], cards: [['price', false], ['size', false]] }));
        expect(document.activeElement).toBe(next.querySelector('#chip-color'));
    });

    test('a chip removed by keyboard hands the focus to the card of that filter', () => {
        document.getElementById('hyperion-layered-nav').outerHTML = nav({ chips: ['color'], cards: [['price', false], ['size', false]] });
        document.getElementById('chip-color').focus();
        const next = oobSwap(nav({ cards: [['price', false], ['color', false], ['size', false]] }));
        expect(document.activeElement).toBe(next.querySelector('#summary-color'));
    });

    test('a focus outside the navigation is left alone', () => {
        document.getElementById('elsewhere').focus();
        oobSwap(nav({ chips: ['price'], cards: [['color', false]] }));
        expect(document.activeElement).toBe(document.getElementById('elsewhere'));
    });

    test('the robots directive of the fragment response updates the page meta', () => {
        document.head.innerHTML = '<meta name="robots" content="INDEX,FOLLOW">';
        const trigger = (robots) => document.getElementById('option-color').dispatchEvent(new CustomEvent('hyperion:listing-robots', { bubbles: true, detail: { robots } }));
        trigger('NOINDEX,NOFOLLOW');
        expect(document.querySelector('meta[name="robots"]').getAttribute('content')).toBe('NOINDEX,NOFOLLOW');
        trigger('INDEX,FOLLOW');
        expect(document.querySelector('meta[name="robots"]').getAttribute('content')).toBe('INDEX,FOLLOW');
        // Anything that is not a directive list is ignored.
        trigger('<script>x</script>');
        trigger(42);
        expect(document.querySelector('meta[name="robots"]').getAttribute('content')).toBe('INDEX,FOLLOW');
        expect(document.querySelectorAll('meta[name="robots"]').length).toBe(1);
        document.head.innerHTML = '';
    });

    test('a page without a robots meta gets one from the directive', () => {
        document.head.innerHTML = '';
        document.getElementById('option-color').dispatchEvent(new CustomEvent('hyperion:listing-robots', { bubbles: true, detail: { robots: 'NOINDEX,NOFOLLOW' } }));
        expect(document.querySelector('head > meta[name="robots"]').getAttribute('content')).toBe('NOINDEX,NOFOLLOW');
        document.head.innerHTML = '';
    });

    test('other out of band swaps are ignored', () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="hyperion-load-more"><a id="more" href="#">more</a></div>');
        const target = document.getElementById('hyperion-load-more');
        const fragment = parse('<div id="hyperion-load-more"><a href="#">more</a></div>');
        document.getElementById('option-color').focus();
        target.dispatchEvent(new CustomEvent('htmx:oobBeforeSwap', { bubbles: true, detail: { shouldSwap: true, target, fragment } }));
        target.replaceWith(fragment);
        fragment.dispatchEvent(new CustomEvent('htmx:oobAfterSwap', { bubbles: true, detail: { shouldSwap: true, target, fragment } }));
        expect(document.activeElement).toBe(document.getElementById('option-color'));
    });
});
