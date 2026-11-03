// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The visitor's `prefers-reduced-motion` preference for JavaScript.
 *
 * `_motion.css` turns every transition, animation and `scroll-behavior` of
 * the light DOM off under `prefers-reduced-motion: reduce`, but a rule in a
 * document stylesheet never reaches a shadow root, and the `behavior`
 * option of `scrollTo()`, `scrollBy()` and `scrollIntoView()` overrides the
 * CSS property anyway: a component that scrolls on a gesture asks here
 * instead of hard coding `'smooth'`. Read on every call (no cached
 * MediaQueryList): the preference is a system setting that can change while
 * the page is open, and the call is cheap.
 */
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the visitor asked for reduced motion (false without matchMedia). */
export function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia(REDUCE_QUERY).matches === true;
}

/**
 * The `behavior` of a programmatic scroll that answers a user gesture:
 * `'auto'` (an instant jump) under reduced motion, `'smooth'` otherwise.
 *
 * @returns {'auto' | 'smooth'}
 */
export function scrollBehavior() {
    return prefersReducedMotion() ? 'auto' : 'smooth';
}
