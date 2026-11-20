// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Quantity steppers of the cart page.
//
// The cart form posts itself when a quantity field changes (its
// `hx-trigger` listens to the `change` of every `[data-hyperion-qty]`
// field, debounced), and the answer replaces the whole cart section. This
// helper supplies what the attributes cannot:
//
//   * the minus / plus buttons: they move the field by its `step` inside
//     `min` / `max` and fire the `change` the form waits for;
//   * the busy state: while the form's request runs, the stepper buttons of
//     the edited lines are disabled (the field stays usable: a newer change
//     replaces the request in flight);
//   * the keyboard focus: the swap replaces the edited line, and a disabled
//     button drops the focus, so after the swap the focus goes back to the
//     control of that line the shopper was on, found by the line's item id.
//     A shopper who moved to another part of the page keeps the focus there.
//
// Delegated on the document: the cart section is swapped on every change.
// The mini-cart drawer has its own stepper logic inside its shadow root.

const FORM = '#hyperion-cart-form';
const ROOT = '[data-hyperion-cart-root]';
const LINE = '[data-hyperion-cart-item]';
const INPUT = '[data-hyperion-qty]';
const STEP = '[data-hyperion-qty-step]';
const EDITING = 'data-hyperion-qty-editing';

// The quantity rules of a line, read from its number input. The stepper
// moves by a numeric `step` (1 while it is absent or `any`); a decimal or
// `any` step makes the line a decimal one. `min` falls back to 1 for whole
// quantities and to "above zero" for decimal ones.
export function qtyRulesOf(input) {
    const stepAttribute = input.getAttribute('step');
    const stepNumber = stepAttribute === null || stepAttribute === '' ? NaN : Number(stepAttribute);
    const hasNumericStep = Number.isFinite(stepNumber) && stepNumber > 0;
    const decimal = stepAttribute === 'any' || (hasNumericStep && !Number.isInteger(stepNumber));
    const parse = (raw) => {
        const value = decimal ? parseFloat(raw) : parseInt(raw, 10);
        // Float steps (0.1 + 0.2) are rounded to the four decimals a quantity keeps.
        return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : NaN;
    };
    const min = parse(input.getAttribute('min'));
    const max = parse(input.getAttribute('max'));
    return {
        parse,
        step: hasNumericStep ? stepNumber : 1,
        min: Number.isFinite(min) ? min : (decimal ? 0 : 1),
        minExclusive: !Number.isFinite(min) && decimal,
        max: Number.isFinite(max) ? max : Infinity,
    };
}

function isAllowed(rules, qty) {
    if (!Number.isFinite(qty) || qty > rules.max) return false;
    return rules.minExclusive ? qty > rules.min : qty >= rules.min;
}

const directionOf = (button) => Math.sign(parseInt(button.getAttribute('data-hyperion-qty-step'), 10) || 0);
const stepped = (rules, qty, direction) => Math.round((qty + direction * rules.step) * 10000) / 10000;

// Each button is enabled exactly when its step stays inside the rules.
function paintButtons(line) {
    const input = line.querySelector(INPUT);
    if (!input) return;
    const rules = qtyRulesOf(input);
    const qty = rules.parse(input.value);
    line.querySelectorAll(STEP).forEach((button) => {
        button.disabled = !isAllowed(rules, stepped(rules, qty, directionOf(button)));
    });
}

// Which control of the stepper an element is: `input`, `-1` or `1`.
function controlOf(element) {
    if (!element || typeof element.matches !== 'function') return null;
    if (element.matches(INPUT)) return 'input';
    if (element.matches(STEP)) return String(directionOf(element));
    return null;
}

function findControl(line, control) {
    if (control === 'input') return line.querySelector(INPUT);
    return line.querySelector(`[data-hyperion-qty-step="${control}"]`);
}

export function installCartQty(root = document) {
    // The last edited line: its item id, the control the shopper used and the
    // field element (once it leaves the document the cart was swapped).
    let edit = null;
    let stepping = false;

    const remember = (line, input, control) => {
        line.setAttribute(EDITING, '');
        edit = { itemId: line.getAttribute('data-item-id'), control, input };
    };

    const onClick = (event) => {
        const button = event.target?.closest?.(STEP);
        const line = button?.closest(LINE);
        const input = line?.querySelector(INPUT);
        if (!input || button.disabled) return;
        const rules = qtyRulesOf(input);
        const direction = directionOf(button);
        const current = rules.parse(input.value);
        // An empty or unreadable field restarts from the minimum.
        const next = Number.isFinite(current) ? stepped(rules, current, direction) : rules.min;
        if (!direction || !isAllowed(rules, next)) return;
        input.value = String(next);
        paintButtons(line);
        remember(line, input, String(direction));
        stepping = true;
        try {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } finally {
            stepping = false;
        }
    };

    const onChange = (event) => {
        const input = event.target;
        if (!input?.matches?.(INPUT)) return;
        const line = input.closest(LINE);
        if (!line) return;
        paintButtons(line);
        // A change fired by a stepper button is already recorded with its button.
        if (!stepping) remember(line, input, 'input');
    };

    const editedLines = () => root.querySelectorAll(`${LINE}[${EDITING}]`);

    const onBeforeRequest = (event) => {
        if (!event.detail?.elt?.matches?.(FORM)) return;
        editedLines().forEach((line) => {
            line.querySelectorAll(STEP).forEach((button) => { button.disabled = true; });
        });
    };

    // A request that ends without a swap (replaced by a newer one, failed)
    // leaves the lines in the document: their buttons follow the rules again.
    const onAfterRequest = (event) => {
        if (!event.detail?.elt?.matches?.(FORM)) return;
        editedLines().forEach((line) => paintButtons(line));
    };

    // The focus at the time of the swap decides where it goes afterwards:
    // on the stepper it stays on that control, lost (a disabled button) it
    // returns to the control last used, elsewhere in the cart it goes to the
    // line's field, outside the cart it is left alone.
    const onBeforeSwap = () => {
        if (!edit) return;
        const active = root.activeElement;
        const lost = !active || active === root.body || !active.isConnected;
        if (lost) return;
        const line = active.closest?.(LINE);
        if (line && line.getAttribute('data-item-id') === edit.itemId && controlOf(active)) {
            edit.control = controlOf(active);
        } else if (active.closest?.(ROOT)) {
            edit.control = 'input';
        } else {
            edit = null;
        }
    };

    const onAfterSwap = () => {
        if (!edit || edit.input.isConnected) return;
        const { itemId, control } = edit;
        edit = null;
        const active = root.activeElement;
        if (active && active !== root.body && active.isConnected) return;
        const line = Array.from(root.querySelectorAll(LINE)).find((item) => item.getAttribute('data-item-id') === itemId);
        if (!line) return;
        const target = findControl(line, control);
        (target && !target.disabled ? target : line.querySelector(INPUT))?.focus({ preventScroll: true });
    };

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('htmx:beforeRequest', onBeforeRequest);
    root.addEventListener('htmx:afterRequest', onAfterRequest);
    root.addEventListener('htmx:beforeSwap', onBeforeSwap);
    root.addEventListener('htmx:afterSwap', onAfterSwap);

    return () => {
        root.removeEventListener('click', onClick);
        root.removeEventListener('change', onChange);
        root.removeEventListener('htmx:beforeRequest', onBeforeRequest);
        root.removeEventListener('htmx:afterRequest', onAfterRequest);
        root.removeEventListener('htmx:beforeSwap', onBeforeSwap);
        root.removeEventListener('htmx:afterSwap', onAfterSwap);
    };
}
