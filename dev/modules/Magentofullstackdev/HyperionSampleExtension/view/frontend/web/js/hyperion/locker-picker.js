// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// <sample-locker-picker>: the pickup point picker shown under the
// `hyperionlocker` rate, written against the public shipping extension
// contract only (no framework, no Hyperion import). The checkout sets
// `context`, `options`, `method` and `value`, then connects the element.
//
// - Search: GET hyperionsample/locker/points?q= through `context.storefront()`.
// - A chosen point is reported with `hyperion-shipping:data` (the id goes to
//   shipping_address.extension_attributes, a summary goes under the shipping
//   row), `hyperion-shipping:valid`, and `hyperion-shipping:address-override`
//   (the parcel goes to the point; the shopper's name and telephone stay,
//   billing becomes a separate address).
// - Until a point is chosen the element reports `hyperion-shipping:invalid`;
//   validate() shows the message and focuses the search field.
// - `value` (the last report, or what the quote already holds) restores the choice.
// - Every connection reports `:data`, then `:valid` (or `:invalid`), then the override.

function fill(source, params) {
    if (!params) return source;
    return source.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

function summaryLines(point) {
    return [point.name, point.street, `${point.city}, ${point.region_code} ${point.postcode}`];
}

class SampleLockerPicker extends HTMLElement {
    /** The major of the shipping extension contract this element was written for. */
    static hyperionApi = '1';

    #rendered = false;
    #input = null;
    #list = null;
    #selectedLine = null;
    #error = null;
    #retry = null;
    #points = [];
    #selected = null;
    #lastValidity = null;
    #abort = null;
    #searchSeq = 0;
    #lastQuery = '';

    connectedCallback() {
        if (!this.#rendered) this.#render();
        queueMicrotask(() => {
            if (!this.isConnected) return;
            if (this.#selected) {
                this.#report(this.#selected);
                return;
            }
            const restoredId = this.#restoredId();
            // The restore runs its own search: a second one would cancel it.
            if (restoredId) {
                void this.#restore(restoredId);
                return;
            }
            this.#emitInvalid();
            if (!this.#points.length) void this.#search('');
        });
    }

    disconnectedCallback() {
        this.#abort?.abort();
        this.#abort = null;
        // A reconnected element reports its validity again, after its data.
        this.#lastValidity = null;
    }

    /** Show what is missing and focus it; true once a point is chosen. */
    validate() {
        if (this.#selected) {
            this.#showError(null);
            return true;
        }
        this.#showError(this.#t('Choose a pickup point.'));
        this.#input?.focus();
        this.#emitInvalid();
        return false;
    }

    // ---------------------------------------------------------------- rendering

    #render() {
        this.#rendered = true;
        this.style.display = 'block';
        const id = `sample-locker-${Math.random().toString(36).slice(2, 10)}`;

        const form = document.createElement('div');
        form.setAttribute('role', 'search');
        form.style.cssText = 'display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap';

        const field = document.createElement('div');
        field.style.cssText = 'flex:1 1 12rem';
        const label = document.createElement('label');
        label.htmlFor = id;
        label.style.cssText = 'display:block;font-weight:600;margin-bottom:0.25rem';
        label.textContent = this.#t('Find a pickup point');
        const input = document.createElement('input');
        input.id = id;
        input.type = 'search';
        input.autocomplete = 'off';
        input.setAttribute('data-sample-locker-search', '');
        input.style.cssText = 'display:block;width:100%;min-height:44px;padding:0 0.75rem;border:1px solid #6b7280;border-radius:6px;font:inherit';
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.#search(input.value);
            }
        });
        field.append(label, input);

        const submit = document.createElement('button');
        submit.type = 'button';
        submit.setAttribute('data-sample-locker-submit', '');
        submit.textContent = this.#t('Search');
        submit.style.cssText = 'min-height:44px;padding:0 1rem;border:1px solid #0f766e;border-radius:6px;font:inherit;font-weight:600;color:#fff;background:#0f766e;cursor:pointer';
        submit.addEventListener('click', () => void this.#search(input.value));
        form.append(field, submit);

        const list = document.createElement('ul');
        list.setAttribute('data-sample-locker-results', '');
        list.setAttribute('aria-live', 'polite');
        list.style.cssText = 'list-style:none;margin:0.75rem 0 0;padding:0;display:grid;gap:0.5rem';

        const selected = document.createElement('p');
        selected.setAttribute('data-sample-locker-selected', '');
        selected.style.cssText = 'margin:0.75rem 0 0;font-weight:600';
        selected.hidden = true;

        const error = document.createElement('p');
        error.id = `${id}-error`;
        error.setAttribute('data-sample-locker-error', '');
        error.setAttribute('role', 'alert');
        error.style.cssText = 'margin:0.5rem 0 0;color:#b91c1c;font-size:0.875rem';
        error.hidden = true;

        const retry = document.createElement('button');
        retry.type = 'button';
        retry.setAttribute('data-sample-locker-retry', '');
        retry.textContent = this.#t('Retry');
        retry.style.cssText = 'margin-top:0.5rem;min-height:44px;padding:0 1rem;border:1px solid #0f766e;border-radius:6px;font:inherit;color:#0f766e;background:#fff;cursor:pointer';
        retry.hidden = true;
        retry.addEventListener('click', () => void this.#search(this.#lastQuery));

        this.#input = input;
        this.#list = list;
        this.#selectedLine = selected;
        this.#error = error;
        this.#retry = retry;
        this.append(form, list, selected, error, retry);
    }

    #renderPoints() {
        if (!this.#list) return;
        this.#list.replaceChildren();
        if (!this.#points.length) {
            const empty = document.createElement('li');
            empty.textContent = this.#t('No pickup point matches your search.');
            this.#list.append(empty);
            return;
        }
        for (const point of this.#points) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('data-sample-locker-point', point.id);
            const isSelected = this.#selected?.id === point.id;
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            button.style.cssText = `display:block;width:100%;text-align:left;padding:0.5rem 0.75rem;border:${isSelected ? '2px solid #0f766e' : '1px solid #d1d5db'};border-radius:6px;font:inherit;background:#fff;cursor:pointer`;
            const name = document.createElement('span');
            name.style.cssText = 'display:block;font-weight:600';
            name.textContent = point.name;
            const address = document.createElement('span');
            address.style.cssText = 'display:block;font-size:0.875rem';
            address.textContent = `${point.street}, ${point.city} ${point.postcode}`;
            button.append(name, address);
            button.addEventListener('click', () => this.#choose(point));
            item.append(button);
            this.#list.append(item);
        }
    }

    #showError(message, withRetry = false) {
        if (this.#error) {
            this.#error.textContent = message ?? '';
            this.#error.hidden = !message;
        }
        // The checkout moves the focus to the first field marked invalid after
        // an early Place Order press: the search field is that field.
        if (this.#input) {
            if (message && !withRetry) {
                this.#input.setAttribute('aria-invalid', 'true');
                this.#input.setAttribute('aria-describedby', this.#error?.id ?? '');
            } else {
                this.#input.removeAttribute('aria-invalid');
                this.#input.removeAttribute('aria-describedby');
            }
        }
        if (this.#retry) this.#retry.hidden = !withRetry;
    }

    // ---------------------------------------------------------------- data

    async #search(query) {
        if (!this.context) return;
        const text = String(query ?? '').trim();
        this.#lastQuery = text;
        this.#abort?.abort();
        const controller = new AbortController();
        this.#abort = controller;
        const seq = ++this.#searchSeq;
        const path = typeof this.options?.pointsPath === 'string' && this.options.pointsPath !== ''
            ? this.options.pointsPath
            : 'hyperionsample/locker/points';
        try {
            const answer = await this.context.storefront(`${path}?q=${encodeURIComponent(text)}`, {
                method: 'GET',
                signal: controller.signal,
            });
            if (seq !== this.#searchSeq) return;
            this.#points = Array.isArray(answer?.points) ? answer.points.filter((p) => p && typeof p.id === 'string') : [];
            this.#showError(null);
            this.#renderPoints();
        } catch (error) {
            if (seq !== this.#searchSeq || error?.kind === 'aborted' || error?.name === 'AbortError') return;
            this.#showError(this.#t('The pickup points could not be loaded.'), true);
        }
    }

    async #restore(id) {
        await this.#search('');
        const point = this.#points.find((candidate) => candidate.id === id);
        if (point) this.#choose(point);
        else this.#emitInvalid();
    }

    #restoredId() {
        const value = this.value;
        const fromState = value?.state && typeof value.state === 'object' ? value.state.pointId : null;
        const fromAddress = value?.address?.hyperion_sample_locker_id;
        const id = typeof fromState === 'string' && fromState !== '' ? fromState : fromAddress;
        return typeof id === 'string' && id !== '' ? id : null;
    }

    #choose(point) {
        this.#selected = point;
        this.#showError(null);
        if (this.#selectedLine) {
            this.#selectedLine.textContent = this.#t('Selected: {name}', { name: point.name });
            this.#selectedLine.hidden = false;
        }
        this.#renderPoints();
        this.#report(point);
    }

    #report(point) {
        this.#emit('hyperion-shipping:data', {
            address: { hyperion_sample_locker_id: point.id },
            summary: { label: this.#t('Pickup point'), lines: summaryLines(point) },
            state: { pointId: point.id },
        });
        // After every `:data`: the host resets the validity of an extension on each new value.
        this.#lastValidity = true;
        this.#emit('hyperion-shipping:valid', {});
        this.#emit('hyperion-shipping:address-override', {
            address: {
                firstname: '',
                lastname: '',
                company: point.name,
                street: [point.street],
                city: point.city,
                postcode: point.postcode,
                country_id: point.country_id,
                region: point.region,
                region_code: point.region_code,
                region_id: point.region_id,
            },
            keepContact: true,
            separateBilling: true,
        });
    }

    #emitInvalid() {
        if (this.#lastValidity === false) return;
        this.#lastValidity = false;
        this.#emit('hyperion-shipping:invalid', { message: this.#t('Choose a pickup point.') });
    }

    #emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    }

    #t(source, params) {
        const translate = this.context?.t;
        return typeof translate === 'function' ? translate.call(this.context, source, params) : fill(source, params);
    }
}

if (!customElements.get('sample-locker-picker')) {
    customElements.define('sample-locker-picker', SampleLockerPicker);
}
