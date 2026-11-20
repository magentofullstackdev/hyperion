// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    CAPTCHA_PHRASES,
    CART_LOCKED_PHRASE,
    classifyError,
    COUPON_REFUSAL_PREFIX,
    describeError,
    isCaptchaMessage,
    isCartPath,
    isOrderPost,
    matchesPhrase,
    parseRetryAfter,
    QUOTE_GONE_PHRASES,
    setPhraseTranslations,
    SHIPPING_METHOD_REJECTED_PHRASES,
    STOCK_PHRASES,
} from '../error-kinds.js';
import {
    MagentoApiError,
    NetworkError,
    NON_JSON_BODY,
    normalizeMagentoError,
    RequestTimeoutError,
} from '../errors.js';

const SAVE = { path: 'guest-carts/abc/shipping-information', method: 'POST' };
const GUEST_ORDER = { path: 'guest-carts/abc/payment-information', method: 'POST' };
const CUSTOMER_ORDER = { path: 'carts/mine/payment-information', method: 'POST' };

/** The phrase as the web API renders it: every placeholder filled. */
function rendered(phrase: string): string {
    return phrase.replace(/%(\d+|[A-Za-z_]\w*)/g, 'X7');
}

afterEach(() => {
    setPhraseTranslations(null);
    vi.restoreAllMocks();
});

describe('classifyError: one case per kind', () => {
    it('offline: a transport failure while the browser reports no connection', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const error = classifyError(new NetworkError(new TypeError('Failed to fetch')), SAVE);
        expect(error.kind).toBe('offline');
        expect(error.message).toBe('You appear to be offline. Check your connection and try again.');
    });

    it('network: a transport failure with a connection, never the text of the browser', () => {
        const error = classifyError(new NetworkError(new TypeError('Failed to fetch')), SAVE);
        expect(error.kind).toBe('network');
        expect(error.message).toBe('We could not reach the store. Please try again.');
        expect(error.message).not.toContain('Failed to fetch');
    });

    it('timeout: the time limit of the client, or a bare TimeoutError', () => {
        const error = classifyError(new RequestTimeoutError(), SAVE);
        expect(error.kind).toBe('timeout');
        expect(error.message).toBe('The store is taking too long to answer. Please try again.');
        expect(classifyError(new DOMException('signal timed out', 'TimeoutError'), SAVE).kind).toBe('timeout');
    });

    it('session-expired: HTTP 401', () => {
        const error = classifyError(
            normalizeMagentoError(401, { message: "The consumer isn't authorized to access %resources.", parameters: { resources: 'self' } }),
            { path: 'carts/mine/totals', method: 'GET' }
        );
        expect(error.kind).toBe('session-expired');
        expect(error.httpStatus).toBe(401);
        expect(error.message).toBe('Your session has expired. Sign in again to continue. What you entered has been kept.');
    });

    it('quote-gone: a 404 that names the quote, on a cart route', () => {
        const guest = classifyError(
            normalizeMagentoError(404, {
                message: 'No such entity with %fieldName = %fieldValue',
                parameters: { fieldName: 'cartId', fieldValue: '12' },
            }),
            SAVE
        );
        expect(guest.kind).toBe('quote-gone');
        expect(guest.message).toBe('Your cart has changed or expired.');
        expect(guest.message).not.toContain('No such entity');

        const customer = classifyError(
            normalizeMagentoError(404, { message: 'Current customer does not have an active cart.' }),
            { path: 'carts/mine/payment-information', method: 'GET' }
        );
        expect(customer.kind).toBe('quote-gone');

        const byHand = classifyError(new MagentoApiError(404, '404', 'No such entity with customerId = 5'), { path: 'carts/mine', method: 'GET' });
        expect(byHand.kind).toBe('quote-gone');
    });

    it('a 404 for something else than the quote is not quote-gone', () => {
        const coupon = classifyError(
            normalizeMagentoError(404, { message: "The coupon code isn't valid. Verify the code and try again." }),
            { path: 'guest-carts/abc/coupons/NOPE', method: 'PUT' }
        );
        expect(coupon.kind).toBe('validation');
        expect(coupon.message).toBe("The coupon code isn't valid. Verify the code and try again.");

        const otherEntity = classifyError(
            normalizeMagentoError(404, {
                message: 'No such entity with %fieldName = %fieldValue',
                parameters: { fieldName: 'addressId', fieldValue: '9' },
            }),
            { path: 'carts/mine/billing-address', method: 'POST' }
        );
        expect(otherEntity).toMatchObject({ kind: 'unexpected', message: 'Something went wrong. Please try again.' });

        const otherRoute = classifyError(
            normalizeMagentoError(404, {
                message: 'No such entity with %fieldName = %fieldValue',
                parameters: { fieldName: 'cartId', fieldValue: '12' },
            }),
            { path: 'customers/isEmailAvailable', method: 'POST' }
        );
        expect(otherRoute.kind).toBe('unexpected');
        expect(otherRoute.message).not.toContain('No such entity');
    });

    it('captcha: a refused CAPTCHA word answered with HTTP 429 belongs to the CAPTCHA field', () => {
        const error = classifyError(normalizeMagentoError(429, { message: 'Incorrect CAPTCHA' }), GUEST_ORDER);
        expect(error.kind).toBe('captcha');
        expect(error.message).toBe('Incorrect CAPTCHA');
    });

    it('rate-limited: HTTP 429 with the wait of Retry-After in the text', () => {
        const error = classifyError(normalizeMagentoError(429, { message: 'Slow down' }, 12000), SAVE);
        expect(error.kind).toBe('rate-limited');
        expect(error.retryAfterMs).toBe(12000);
        expect(error.message).toBe('Too many requests. Please wait 12 seconds.');
    });

    it('rate-limited without Retry-After: five seconds and the plain text', () => {
        const error = classifyError(normalizeMagentoError(429, NON_JSON_BODY), SAVE);
        expect(error.kind).toBe('rate-limited');
        expect(error.retryAfterMs).toBe(5000);
        expect(error.message).toBe('Too many requests. Please wait a moment.');
    });

    it('unavailable: HTTP 5xx, also with a JSON message, which is not shown', () => {
        const error = classifyError(
            normalizeMagentoError(500, { message: 'Internal Error. Details are available in Magento log file. Report ID: webapi-1' }),
            SAVE
        );
        expect(error.kind).toBe('unavailable');
        expect(error.message).toBe('The store is temporarily unavailable. Please try again in a moment.');
    });

    it('unavailable: an HTML 503 never appears in the message', () => {
        const page = '<html><head><title>503 Service Temporarily Unavailable</title></head><body>nginx</body></html>';
        const thrown = normalizeMagentoError(503, NON_JSON_BODY);
        const error = classifyError(thrown, SAVE);
        expect(error.kind).toBe('unavailable');
        expect(error.message).toBe('The store is temporarily unavailable. Please try again in a moment.');
        expect(JSON.stringify(error)).not.toContain('<');
        expect(page).not.toContain(error.message);
    });

    it('unavailable: any other error status whose body is not JSON', () => {
        expect(classifyError(normalizeMagentoError(404, NON_JSON_BODY), SAVE).kind).toBe('unavailable');
        expect(classifyError(normalizeMagentoError(400, NON_JSON_BODY), SAVE).kind).toBe('unavailable');
    });

    it('blocked: HTTP 403 with a body that is not JSON, or with none', () => {
        const error = classifyError(normalizeMagentoError(403, NON_JSON_BODY), SAVE);
        expect(error.kind).toBe('blocked');
        expect(error.message).toBe('Your request was blocked. Reload the page or contact us.');
        expect(classifyError(normalizeMagentoError(403, undefined), SAVE).kind).toBe('blocked');
        expect(classifyError(normalizeMagentoError(403, { message: 'Not allowed for this cart.' }), SAVE).kind).toBe('validation');
    });

    it('cart-locked: the phrase of the cart mutex', () => {
        const error = classifyError(normalizeMagentoError(400, { message: CART_LOCKED_PHRASE }), GUEST_ORDER);
        expect(CART_LOCKED_PHRASE).toBe('The cart is locked for processing. Please try again later.');
        expect(error.kind).toBe('cart-locked');
    });

    it('shipping-method-rejected: the server message is kept', () => {
        const carrier = classifyError(
            normalizeMagentoError(400, { message: 'Carrier with such method not found: %1, %2', parameters: ['ups', 'GND'] }),
            SAVE
        );
        expect(carrier.kind).toBe('shipping-method-rejected');
        expect(carrier.message).toBe('Carrier with such method not found: ups, GND');
        expect(carrier.rawMessage).toBe('Carrier with such method not found: %1, %2');

        const missing = classifyError(
            normalizeMagentoError(400, { message: 'The shipping method is missing. Select the shipping method and try again.' }),
            CUSTOMER_ORDER
        );
        expect(missing.kind).toBe('shipping-method-rejected');
        expect(SHIPPING_METHOD_REJECTED_PHRASES).toHaveLength(2);
    });

    it('stock: the server message is kept', () => {
        const error = classifyError(
            normalizeMagentoError(400, { message: 'Product %name is out of stock.', parameters: { name: 'Joust Duffle Bag' } }),
            SAVE
        );
        expect(error.kind).toBe('stock');
        expect(error.message).toBe('Product Joust Duffle Bag is out of stock.');
    });

    it('captcha: the server message is kept', () => {
        const error = classifyError(normalizeMagentoError(400, { message: 'Incorrect CAPTCHA' }), GUEST_ORDER);
        expect(error.kind).toBe('captcha');
        expect(error.message).toBe('Incorrect CAPTCHA');
    });

    it('validation: any other 4xx with a JSON message, rendered', () => {
        const error = classifyError(
            normalizeMagentoError(400, { message: '"%fieldName" is required. Enter and try again.', parameters: { fieldName: 'postcode' } }),
            SAVE
        );
        expect(error.kind).toBe('validation');
        expect(error.message).toBe('"postcode" is required. Enter and try again.');
    });

    it('order-unknown: no usable answer to the order request', () => {
        const timeout = classifyError(new RequestTimeoutError(), GUEST_ORDER);
        expect(timeout.kind).toBe('order-unknown');
        expect(timeout.underlyingKind).toBe('timeout');
        expect(timeout.message).toBe(describeError(new RequestTimeoutError(), GUEST_ORDER));

        expect(classifyError(new NetworkError(new TypeError('Failed to fetch')), CUSTOMER_ORDER))
            .toMatchObject({ kind: 'order-unknown', underlyingKind: 'network' });
        expect(classifyError(normalizeMagentoError(502, NON_JSON_BODY), CUSTOMER_ORDER))
            .toMatchObject({ kind: 'order-unknown', underlyingKind: 'unavailable', httpStatus: 502 });
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        expect(classifyError(new NetworkError(new TypeError('Failed to fetch')), GUEST_ORDER))
            .toMatchObject({ kind: 'order-unknown', underlyingKind: 'offline' });
    });

    it('an answered order request keeps its own kind', () => {
        expect(classifyError(normalizeMagentoError(400, { message: 'Enter a valid payment method and try again.' }), GUEST_ORDER).kind)
            .toBe('validation');
        expect(classifyError(normalizeMagentoError(401, { message: 'x' }), CUSTOMER_ORDER).kind).toBe('session-expired');
        expect(classifyError(normalizeMagentoError(429, NON_JSON_BODY), GUEST_ORDER).kind).toBe('rate-limited');
    });

    it('unexpected: everything else', () => {
        const generic = 'Something went wrong. Please try again.';
        expect(classifyError(normalizeMagentoError(400, {}), SAVE)).toMatchObject({ kind: 'unexpected', message: generic });
        expect(classifyError(normalizeMagentoError(200, NON_JSON_BODY), SAVE)).toMatchObject({ kind: 'unexpected', message: generic });
        expect(classifyError(new TypeError("Cannot read properties of undefined (reading 'x')"), SAVE))
            .toMatchObject({ kind: 'unexpected', message: generic });
        expect(classifyError('boom', SAVE)).toMatchObject({ kind: 'unexpected', message: generic });
        expect(classifyError(new DOMException('The operation was aborted.', 'AbortError'), SAVE))
            .toMatchObject({ kind: 'unexpected', message: generic });
    });

    it('unexpected: a plain Error thrown with a text for the shopper keeps that text', () => {
        expect(classifyError(new Error('Enter the purchase order number.'), GUEST_ORDER))
            .toMatchObject({ kind: 'unexpected', message: 'Enter the purchase order number.' });
    });
});

describe('describeError', () => {
    it('gives the message of the class, with or without the request', () => {
        expect(describeError(new NetworkError(new TypeError('Load failed')))).toBe('We could not reach the store. Please try again.');
        expect(describeError(normalizeMagentoError(400, { message: 'Invalid email' }))).toBe('Invalid email');
        expect(describeError(normalizeMagentoError(503, NON_JSON_BODY), SAVE))
            .toBe('The store is temporarily unavailable. Please try again in a moment.');
    });

    it('a missing quote never shows the phrase of the server, with or without the request', () => {
        const gone = normalizeMagentoError(404, {
            message: 'No such entity with %fieldName = %fieldValue',
            parameters: { fieldName: 'cartId', fieldValue: '12' },
        });
        expect(describeError(gone)).toBe('Your cart has changed or expired.');
        expect(describeError(gone, SAVE)).toBe('Your cart has changed or expired.');
    });
});

describe('stock phrases', () => {
    it('lists the phrases of the stock checks', () => {
        expect(STOCK_PHRASES).toEqual([
            'Some of the products are out of stock.',
            'This product is out of stock.',
            'Product %name is out of stock.',
            'Please correct the quantity for some products.',
            'The requested qty. is not available',
            'Not enough items for sale',
            'Only %1 of %2 available',
            'The fewest you may purchase is %1.',
            'The requested qty exceeds the maximum qty allowed in shopping cart',
            'You cannot use decimal quantity for this product.',
            'You can buy %1 only in quantities of %2 at a time.',
            'You can buy this product only in quantities of %1 at a time.',
            'There are no source items with the in stock status',
            'The requested sku is not assigned to given stock',
            'The requested sku is not assigned to given stock.',
        ]);
    });

    it.each(STOCK_PHRASES.map((phrase) => [phrase]))('"%s" is the stock kind, raw and rendered', (phrase) => {
        expect(classifyError(normalizeMagentoError(400, { message: phrase }), SAVE).kind).toBe('stock');
        expect(classifyError(new MagentoApiError(400, '400', rendered(phrase)), GUEST_ORDER).kind).toBe('stock');
        expect(matchesPhrase(rendered(phrase), STOCK_PHRASES)).toBe(true);
    });

    it('is found among the joined messages of the quote validator and inside an argument', () => {
        const joined = 'Some of the products are out of stock.\nPlease check the billing address information.';
        expect(classifyError(new MagentoApiError(400, '400', joined), GUEST_ORDER).kind).toBe('stock');

        const wrapped = normalizeMagentoError(400, {
            message: 'The shipping information was unable to be saved. Error: "%message"',
            parameters: { message: 'Not enough items for sale' },
        });
        expect(classifyError(wrapped, SAVE).kind).toBe('stock');
    });

    it('does not take a longer sentence that only contains a phrase', () => {
        expect(matchesPhrase('We told you: Not enough items for sale, sorry.', STOCK_PHRASES)).toBe(false);
        expect(matchesPhrase('', STOCK_PHRASES)).toBe(false);
    });
});

describe('captcha phrases', () => {
    it('lists the refusals of the image CAPTCHA', () => {
        expect(CAPTCHA_PHRASES).toEqual([
            'Incorrect CAPTCHA',
            'Incorrect CAPTCHA.',
            'CAPTCHA is required.',
            'Please provide CAPTCHA code and try again',
            'Too many coupon code requests, please try again later.',
        ]);
    });

    it.each(CAPTCHA_PHRASES.map((phrase) => [phrase]))('"%s" is the captcha kind', (phrase) => {
        expect(classifyError(normalizeMagentoError(400, { message: phrase }), { path: 'carts/mine/coupons/SAVE10', method: 'PUT' }).kind)
            .toBe('captcha');
        expect(isCaptchaMessage(phrase)).toBe(true);
    });

    describe('behind the coupon refusal prefix', () => {
        const GUEST_COUPON = { path: 'guest-carts/abc/coupons/SAVE10', method: 'PUT' };
        const CUSTOMER_COUPON = { path: 'carts/mine/coupons/SAVE10', method: 'PUT' };
        const BARE_COUPON = { path: 'coupons', method: 'PUT' };
        const refusal = (reason: string): MagentoApiError =>
            normalizeMagentoError(400, { message: `${COUPON_REFUSAL_PREFIX}${reason}` });

        it.each([[GUEST_COUPON], [CUSTOMER_COUPON], [BARE_COUPON]])(
            'a refused answer is the captcha kind and its message is the reason alone (%o)',
            (ctx) => {
                const error = classifyError(refusal('Incorrect CAPTCHA'), ctx);
                expect(error.kind).toBe('captcha');
                expect(error.message).toBe('Incorrect CAPTCHA');
            },
        );

        it('too many requests is the captcha kind too', () => {
            const error = classifyError(refusal('Too many coupon code requests, please try again later.'), GUEST_COUPON);
            expect(error.kind).toBe('captcha');
            expect(error.message).toBe('Too many coupon code requests, please try again later.');
        });

        it('recognizes the reason in the wording of the store', () => {
            expect(classifyError(refusal('CAPTCHA errato'), GUEST_COUPON).kind).toBe('validation');

            setPhraseTranslations({ 'Incorrect CAPTCHA': 'CAPTCHA errato' });
            const error = classifyError(refusal('CAPTCHA errato'), GUEST_COUPON);
            expect(error.kind).toBe('captcha');
            expect(error.message).toBe('CAPTCHA errato');
        });

        it('another reason stays a refusal of the code, with the whole message', () => {
            const error = classifyError(refusal('The coupon has expired.'), GUEST_COUPON);
            expect(error.kind).toBe('validation');
            expect(error.message).toBe(`${COUPON_REFUSAL_PREFIX}The coupon has expired.`);
        });

        it.each([
            ['Something else went wrong: Incorrect CAPTCHA'],
            ['Incorrect CAPTCHA was typed'],
            [`Sorry. ${COUPON_REFUSAL_PREFIX}Incorrect CAPTCHA`],
            [`${COUPON_REFUSAL_PREFIX}Incorrect CAPTCHA, or so it seems`],
        ])('"%s" is not the captcha kind', (message) => {
            expect(classifyError(normalizeMagentoError(400, { message }), GUEST_COUPON).kind).toBe('validation');
            expect(isCaptchaMessage(message)).toBe(false);
        });
    });

    it('a login error that is not about the CAPTCHA is not one', () => {
        expect(isCaptchaMessage('Invalid login or password.')).toBe(false);
    });
});

describe('phrases in the wording of the store', () => {
    it('a translated refusal is recognized once the dictionary is set, placeholders included', () => {
        const locked = new MagentoApiError(400, '400', 'Il carrello è bloccato. Riprova più tardi.');
        const only = new MagentoApiError(400, '400', 'Solo 3 di 5 disponibili');
        expect(classifyError(locked, GUEST_ORDER).kind).toBe('validation');
        expect(classifyError(only, GUEST_ORDER).kind).toBe('validation');

        setPhraseTranslations({
            [CART_LOCKED_PHRASE]: 'Il carrello è bloccato. Riprova più tardi.',
            'Only %1 of %2 available': 'Solo %1 di %2 disponibili',
        });

        expect(classifyError(locked, GUEST_ORDER).kind).toBe('cart-locked');
        expect(classifyError(only, GUEST_ORDER).kind).toBe('stock');
        expect(matchesPhrase('Only 3 of 5 available', STOCK_PHRASES)).toBe(true);
    });
});

describe('request predicates', () => {
    it('isOrderPost: only the POST to payment-information of a cart', () => {
        expect(isOrderPost(GUEST_ORDER)).toBe(true);
        expect(isOrderPost(CUSTOMER_ORDER)).toBe(true);
        expect(isOrderPost({ path: '/carts/mine/payment-information/', method: 'post' })).toBe(true);
        expect(isOrderPost({ path: 'carts/mine/payment-information', method: 'GET' })).toBe(false);
        expect(isOrderPost({ path: 'carts/mine/set-payment-information', method: 'POST' })).toBe(false);
        expect(isOrderPost({ path: 'guest-carts/abc/set-payment-information', method: 'POST' })).toBe(false);
        expect(isOrderPost({ path: 'guest-carts/abc/shipping-information', method: 'POST' })).toBe(false);
    });

    it('isCartPath: the routes under the quote', () => {
        expect(isCartPath('guest-carts/abc')).toBe(true);
        expect(isCartPath('guest-carts/abc/totals')).toBe(true);
        expect(isCartPath('carts/mine')).toBe(true);
        expect(isCartPath('/carts/mine/coupons')).toBe(true);
        expect(isCartPath('customers/isEmailAvailable')).toBe(false);
        expect(isCartPath('carts/mineral')).toBe(false);
        expect(QUOTE_GONE_PHRASES).toEqual([
            'No such entity with %fieldName = %fieldValue',
            'Current customer does not have an active cart.',
        ]);
    });
});

describe('parseRetryAfter', () => {
    const now = Date.parse('2030-01-01T00:00:00Z');

    it('reads a number of seconds', () => {
        expect(parseRetryAfter('7', now)).toBe(7000);
        expect(parseRetryAfter(' 30 ', now)).toBe(30000);
    });

    it('reads an HTTP date', () => {
        expect(parseRetryAfter('Tue, 01 Jan 2030 00:00:20 GMT', now)).toBe(20000);
    });

    it('caps the wait at sixty seconds, in both forms', () => {
        expect(parseRetryAfter('3600', now)).toBe(60000);
        expect(parseRetryAfter('Tue, 01 Jan 2030 01:00:00 GMT', now)).toBe(60000);
    });

    it('never waits less than a second', () => {
        expect(parseRetryAfter('0', now)).toBe(1000);
        expect(parseRetryAfter('Mon, 31 Dec 2029 23:00:00 GMT', now)).toBe(1000);
    });

    it('is undefined without a usable value, and the class then waits five seconds', () => {
        expect(parseRetryAfter(null, now)).toBeUndefined();
        expect(parseRetryAfter('', now)).toBeUndefined();
        expect(parseRetryAfter('soon', now)).toBeUndefined();
        expect(classifyError(normalizeMagentoError(429, {}, parseRetryAfter('soon', now)), SAVE).retryAfterMs).toBe(5000);
    });
});
