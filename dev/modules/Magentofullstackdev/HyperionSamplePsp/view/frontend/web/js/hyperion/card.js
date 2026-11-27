// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// <sample-psp-card>: the payment element of the sample provider, written
// against the public element contract of the Hyperion checkout only (no
// framework, no Hyperion import). The checkout loads this module when the
// method is offered, sets `context`, `options`, `method`, `config` and
// `token`, then connects the element.
//
// - Card rows frame the fake hosted field (/hyperionsample/hosted/field) and
//   report `ready` once it answered, `valid` / `invalid` as the number
//   becomes complete or not.
// - getPaymentData() builds the nonce from the BASE totals of the snapshot,
//   runs the fake 3D Secure challenge for a number ending in 3 (a modal
//   dialog framing /hyperionsample/threeds/challenge, `busy` heartbeats
//   while it is open) and asks to store the card when the box is ticked.
// - Stored card rows (`token` set) send the token's public hash.

const FIELD_SOURCE = 'hyperion-sample-field';
const THREEDS_SOURCE = 'hyperion-sample-threeds';
const HOST_SOURCE = 'hyperion-sample-host';
const FIELD_TIMEOUT_MS = 8000;
const TOKENIZE_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 2000;

/** Fills `{name}` placeholders, for the case where no context is around. */
function fill(source, params) {
    if (!params) return source;
    return source.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

function tokenLast4(token) {
    const masked = token?.details?.maskedCC;
    return typeof masked === 'string' && masked !== '' ? masked.slice(-4) : '****';
}

function abortError() {
    return new DOMException('The payment step was aborted.', 'AbortError');
}

class SamplePspCard extends HTMLElement {
    /** The major of the element contract this element was written for. */
    static hyperionApi = '1';

    /** Row title of a stored card (used by hosts that ask the class). */
    static describeToken(token) {
        return { label: fill('Sample card ending {last4}', { last4: tokenLast4(token) }) };
    }

    #rendered = false;
    #readySent = false;
    #frame = null;
    #error = null;
    #save = null;
    #saveRow = null;
    #complete = false;
    #lastValidity = null;
    #unsubscribe = null;
    #fieldTimer = 0;
    #requests = new Map();
    #requestSeq = 0;
    #dialog = null;
    #dialogFrame = null;
    #threedsAnswer = null;
    #onMessage = (event) => this.#handleMessage(event);

    connectedCallback() {
        window.addEventListener('message', this.#onMessage);
        if (!this.#rendered) this.#render();
        this.#unsubscribe?.();
        this.#unsubscribe = this.context?.subscribe?.((snapshot) => this.#syncSnapshot(snapshot)) ?? null;
        this.#syncSnapshot(this.context?.snapshot?.() ?? null);
        if (this.token) {
            // After the host's own connection step, so its listeners see both events.
            queueMicrotask(() => {
                if (!this.isConnected) return;
                this.#sendReady();
                this.#emitValidity(true, '');
            });
        } else if (!this.#readySent) {
            this.#armFieldTimeout();
        }
    }

    disconnectedCallback() {
        window.removeEventListener('message', this.#onMessage);
        this.#unsubscribe?.();
        this.#unsubscribe = null;
        window.clearTimeout(this.#fieldTimer);
        for (const pending of this.#requests.values()) pending.reject(abortError());
        this.#requests.clear();
        this.#threedsAnswer?.('abort');
    }

    /** Show what is missing and focus it; true when the card can be charged. */
    validate() {
        if (this.token) return true;
        if (this.#complete) {
            this.#showError(null);
            return true;
        }
        const message = this.#t('Enter a complete card number.');
        this.#showError(message);
        this.#postToField({ type: 'invalid', invalid: true });
        this.#postToField({ type: 'focus' });
        this.#frame?.focus();
        this.#emitValidity(false, message);
        return false;
    }

    async getPaymentData(signal) {
        if (signal?.aborted) throw abortError();
        if (this.token) {
            return { additional_data: { public_hash: String(this.token.publicHash ?? '') } };
        }
        if (!this.validate()) throw new Error(this.#t('Enter a complete card number.'));

        const field = await this.#tokenize(signal);
        if (!field.complete) {
            this.validate();
            throw new Error(this.#t('Enter a complete card number.'));
        }
        const snapshot = this.context?.snapshot?.() ?? null;
        const base = snapshot?.totals?.base ?? null;
        if (!base || !Number.isFinite(base.grandTotal) || typeof base.currency !== 'string' || base.currency === '') {
            throw new Error(this.#t('The order total is not ready yet. Please try again.'));
        }

        const additionalData = {
            sample_nonce: `sample-${base.grandTotal.toFixed(2)}-${base.currency.toUpperCase()}`,
            sample_last4: field.last4,
        };
        if (field.last4.endsWith('3')) {
            const approved = await this.#challenge(signal);
            if (!approved) throw new Error(this.#t('The card verification was declined.'));
            additionalData.sample_threeds = 'approved';
        }
        if (snapshot && !snapshot.isGuest && this.#save?.checked) {
            additionalData.is_active_payment_token_enabler = true;
        }
        return { additional_data: additionalData };
    }

    /** The order request failed: nothing single use survives (the next attempt tokenizes again). */
    orderFailed() {
        this.#threedsAnswer?.('abort');
    }

    // ---------------------------------------------------------------- rendering

    #render() {
        this.#rendered = true;
        this.style.display = 'block';
        if (this.token) {
            const line = document.createElement('p');
            line.setAttribute('data-sample-psp-token', '');
            line.style.margin = '0';
            line.textContent = this.#t('Sample card ending {last4}', { last4: tokenLast4(this.token) });
            this.append(line);
            return;
        }

        const brand = document.createElement('p');
        brand.setAttribute('data-sample-psp-brand', '');
        brand.style.cssText = 'margin:0 0 0.5rem;font-size:0.875rem;opacity:0.8';
        brand.textContent = this.#t('Sample PSP test mode');

        const label = document.createElement('div');
        label.id = `sample-psp-label-${Math.random().toString(36).slice(2, 10)}`;
        label.style.cssText = 'font-weight:600;margin-bottom:0.25rem';
        label.textContent = this.#t('Card number');

        const frame = document.createElement('iframe');
        frame.setAttribute('data-sample-psp-field', '');
        frame.setAttribute('title', this.#t('Card number'));
        frame.setAttribute('aria-describedby', label.id);
        frame.src = this.#url('fieldUrl', 'hyperionsample/hosted/field');
        frame.style.cssText = 'display:block;width:100%;height:48px;border:0;margin:0;padding:0;overflow:hidden';
        frame.setAttribute('scrolling', 'no');
        this.#frame = frame;

        const error = document.createElement('p');
        error.setAttribute('data-sample-psp-error', '');
        error.setAttribute('role', 'alert');
        error.style.cssText = 'margin:0.25rem 0 0;color:#b91c1c;font-size:0.875rem';
        error.hidden = true;
        this.#error = error;

        const saveRow = document.createElement('label');
        saveRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-top:0.75rem;cursor:pointer';
        const save = document.createElement('input');
        save.type = 'checkbox';
        save.setAttribute('data-sample-psp-save', '');
        const saveText = document.createElement('span');
        saveText.textContent = this.#t('Save this card for later');
        saveRow.append(save, saveText);
        saveRow.hidden = true;
        this.#save = save;
        this.#saveRow = saveRow;

        this.append(brand, label, frame, error, saveRow);
    }

    #syncSnapshot(snapshot) {
        if (this.#saveRow) this.#saveRow.hidden = !snapshot || snapshot.isGuest !== false;
    }

    #showError(message) {
        if (!this.#error) return;
        this.#error.textContent = message ?? '';
        this.#error.hidden = !message;
    }

    // ---------------------------------------------------------------- hosted field

    #handleMessage(event) {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.source === FIELD_SOURCE && this.#frame && event.source === this.#frame.contentWindow) {
            this.#handleField(data);
        } else if (data.source === THREEDS_SOURCE && this.#dialogFrame && event.source === this.#dialogFrame.contentWindow) {
            this.#threedsAnswer?.(data.result === 'approve' ? 'approve' : 'decline');
        }
    }

    #handleField(data) {
        if (data.type === 'ready') {
            window.clearTimeout(this.#fieldTimer);
            this.#showError(null);
            this.#sendReady();
            if (this.#lastValidity === null) this.#emitValidity(false, this.#t('Enter a complete card number.'));
            return;
        }
        if (data.type === 'change') {
            this.#complete = data.complete === true;
            if (this.#complete) {
                this.#showError(null);
                this.#postToField({ type: 'invalid', invalid: false });
            }
            this.#emitValidity(this.#complete, this.#t('Enter a complete card number.'));
            return;
        }
        if (data.type === 'tokenized') {
            const pending = this.#requests.get(data.requestId);
            if (!pending) return;
            this.#requests.delete(data.requestId);
            this.#complete = data.complete === true;
            pending.resolve({ complete: this.#complete, last4: typeof data.last4 === 'string' ? data.last4 : '' });
        }
    }

    #armFieldTimeout() {
        window.clearTimeout(this.#fieldTimer);
        this.#fieldTimer = window.setTimeout(() => {
            if (this.#readySent) return;
            const message = this.#t('The card field could not be loaded.');
            this.#showError(message);
            this.#emit('hyperion-payment:error', { message, fatal: false });
        }, FIELD_TIMEOUT_MS);
    }

    #postToField(message) {
        this.#frame?.contentWindow?.postMessage({ source: HOST_SOURCE, ...message }, window.location.origin);
    }

    #tokenize(signal) {
        return new Promise((resolve, reject) => {
            const requestId = `r${++this.#requestSeq}`;
            const timer = window.setTimeout(() => {
                this.#requests.delete(requestId);
                reject(new Error(this.#t('The card field could not be loaded.')));
            }, TOKENIZE_TIMEOUT_MS);
            const onAbort = () => {
                this.#requests.delete(requestId);
                window.clearTimeout(timer);
                reject(abortError());
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            this.#requests.set(requestId, {
                resolve: (value) => {
                    window.clearTimeout(timer);
                    signal?.removeEventListener('abort', onAbort);
                    resolve(value);
                },
                reject: (error) => {
                    window.clearTimeout(timer);
                    signal?.removeEventListener('abort', onAbort);
                    reject(error);
                },
            });
            this.#postToField({ type: 'tokenize', requestId });
        });
    }

    // ---------------------------------------------------------------- 3D Secure

    /** Resolves true on Approve, false on Decline or Escape; rejects when aborted. */
    #challenge(signal) {
        return new Promise((resolve, reject) => {
            const label = this.#t('Verifying your card');
            const dialog = document.createElement('dialog');
            dialog.setAttribute('data-sample-psp-threeds', '');
            dialog.setAttribute('aria-label', this.#t('Card verification'));
            dialog.style.cssText = 'width:min(28rem,calc(100vw - 2rem));padding:0;border:0;border-radius:8px';
            const frame = document.createElement('iframe');
            frame.setAttribute('title', this.#t('Card verification'));
            frame.src = this.#url('challengeUrl', 'hyperionsample/threeds/challenge');
            frame.style.cssText = 'display:block;width:100%;height:20rem;border:0';
            dialog.append(frame);
            this.append(dialog);
            this.#dialog = dialog;
            this.#dialogFrame = frame;

            const beat = () => this.#emit('hyperion-payment:busy', { busy: true, label });
            const heartbeat = window.setInterval(beat, HEARTBEAT_MS);
            const onAbort = () => finish('abort');
            const onCancel = (event) => {
                event.preventDefault();
                finish('decline');
            };
            const finish = (answer) => {
                window.clearInterval(heartbeat);
                signal?.removeEventListener('abort', onAbort);
                dialog.removeEventListener('cancel', onCancel);
                this.#threedsAnswer = null;
                if (dialog.open) dialog.close();
                dialog.remove();
                this.#dialog = null;
                this.#dialogFrame = null;
                this.#emit('hyperion-payment:busy', { busy: false });
                if (answer === 'abort') reject(abortError());
                else resolve(answer === 'approve');
            };
            this.#threedsAnswer = finish;
            signal?.addEventListener('abort', onAbort, { once: true });
            dialog.addEventListener('cancel', onCancel);
            beat();
            dialog.showModal();
        });
    }

    // ---------------------------------------------------------------- helpers

    #sendReady() {
        if (this.#readySent) return;
        this.#readySent = true;
        this.#emit('hyperion-payment:ready', {});
    }

    #emitValidity(valid, message) {
        if (this.#lastValidity === valid) return;
        this.#lastValidity = valid;
        if (valid) this.#emit('hyperion-payment:valid', {});
        else this.#emit('hyperion-payment:invalid', { message });
    }

    #emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    }

    #t(source, params) {
        const translate = this.context?.t;
        return typeof translate === 'function' ? translate.call(this.context, source, params) : fill(source, params);
    }

    /** An option URL when it is same-origin, else the module's own route on the store's base URL. */
    #url(option, fallbackPath) {
        const candidate = this.options?.[option];
        if (typeof candidate === 'string' && candidate !== '') {
            try {
                const url = new URL(candidate, window.location.href);
                if (url.origin === window.location.origin) return url.toString();
            } catch {
                // An unusable option falls back to the store's own route below.
            }
        }
        const base = this.context?.urls?.base || `${window.location.origin}/`;
        return new URL(fallbackPath, base.endsWith('/') ? base : `${base}/`).toString();
    }
}

if (!customElements.get('sample-psp-card')) {
    customElements.define('sample-psp-card', SamplePspCard);
}
