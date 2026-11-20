// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Image CAPTCHA field of Magento's built-in CAPTCHA: the image, the answer
 * input and a Reload button that asks the storefront for a new image.
 *
 * This is the base class; each package defines its own tag from it and
 * supplies the class names of its own Tailwind build through the static
 * `classes` map (the shared package is scanned by neither build, so no
 * class name is written here).
 *
 * The element is light DOM, so the answer input posts with a surrounding
 * plain `<form>` and the page stylesheet applies. It works in two modes,
 * chosen once, when the element is first connected:
 *
 *   Rendered  the element has no CAPTCHA markup inside: it renders the
 *             label, image, Reload button, input and notes from its
 *             attributes.
 *   Adopted   the element wraps server-rendered markup (an image marked
 *             `data-hyperion-captcha-image` and an input marked
 *             `data-hyperion-captcha-input`, or the first text input): it
 *             renders nothing and drives that markup, so the page reads the
 *             same before and after the upgrade. A control marked
 *             `data-hyperion-captcha-reload` becomes the Reload button. The
 *             label, name, `required` and case note are the server's; the
 *             attributes of the same name are ignored.
 *
 * Attributes (properties in camelCase):
 *   form-id         Magento form id (`user_login`, ...). Required.
 *   refresh-url     storefront URL of core's `captcha/refresh` action.
 *   image-src       initial image; without it (and without an adopted image
 *                   that has a `src`) the element asks for one as soon as
 *                   it is displayed.
 *   image-width     pixel size of the image; both are written on the
 *   image-height    `<img>`, so the box exists before the image arrives.
 *   case-sensitive  boolean, shows the case note.
 *   required        boolean, marks the input required.
 *   name            name of the input; defaults to `captcha[<form-id>]`,
 *                   the field core reads from a form post.
 *   label           text of the label and `alt` of the image.
 *   reload-label    text of the Reload button.
 *   case-note       text shown when `case-sensitive` is set.
 *   error           message of the last refused answer; marks the input
 *                   invalid and is announced with it. Empty clears it.
 *
 * API:
 *   value           what the shopper typed (read only).
 *   refresh()       asks for a new image, shows it and empties the input (a
 *                   word is single use); resolves to true when a new image
 *                   was applied. A newer call supersedes an older one.
 *   clear()         empties the input.
 *   focus()         focuses the input.
 *
 * Events (both bubble and are composed):
 *   hyperion:captcha-change         detail `{ formId, value }`, on typing
 *                                   and whenever the input is emptied.
 *   hyperion:captcha-refresh-error  detail `{ formId }`, when no new image
 *                                   could be loaded.
 */
import { html, nothing, type PropertyDeclarations, type PropertyValues } from 'lit';

import { HyperionLightElement } from '../lit/HyperionLightElement.js';

export const CAPTCHA_CHANGE_EVENT = 'hyperion:captcha-change';
export const CAPTCHA_REFRESH_ERROR_EVENT = 'hyperion:captcha-refresh-error';

export interface CaptchaChangeDetail {
    formId: string;
    value: string;
}

export interface CaptchaRefreshErrorDetail {
    formId: string;
}

/** Class names of the parts the element renders; `error` also styles the message added to adopted markup. */
export interface CaptchaClasses {
    root: string;
    label: string;
    requiredMark: string;
    row: string;
    image: string;
    reload: string;
    input: string;
    caseNote: string;
    error: string;
}

const NO_CLASSES: CaptchaClasses = {
    root: '',
    label: '',
    requiredMark: '',
    row: '',
    image: '',
    reload: '',
    input: '',
    caseNote: '',
    error: '',
};

const IMAGE_SELECTOR = '[data-hyperion-captcha-image]';
const INPUT_SELECTOR = '[data-hyperion-captcha-input]';
const RELOAD_SELECTOR = '[data-hyperion-captcha-reload]';
const ERROR_SELECTOR = '[data-hyperion-captcha-error]';

let instances = 0;

function describedByWithout(input: HTMLInputElement, id: string): string[] {
    return (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((token) => token && token !== id);
}

export class CaptchaElement extends HyperionLightElement {
    public static override properties: PropertyDeclarations = {
        formId: { type: String, attribute: 'form-id' },
        refreshUrl: { type: String, attribute: 'refresh-url' },
        imageSrc: { type: String, attribute: 'image-src' },
        imageWidth: { type: Number, attribute: 'image-width' },
        imageHeight: { type: Number, attribute: 'image-height' },
        caseSensitive: { type: Boolean, attribute: 'case-sensitive' },
        required: { type: Boolean },
        name: { type: String },
        label: { type: String },
        reloadLabel: { type: String, attribute: 'reload-label' },
        caseNote: { type: String, attribute: 'case-note' },
        error: { type: String },
    };

    /** Overridden by the class each package defines its tag from. */
    public static classes: CaptchaClasses = NO_CLASSES;

    declare public formId: string;
    declare public refreshUrl: string;
    declare public imageSrc: string;
    declare public imageWidth: number;
    declare public imageHeight: number;
    declare public caseSensitive: boolean;
    declare public required: boolean;
    declare public name: string;
    declare public label: string;
    declare public reloadLabel: string;
    declare public caseNote: string;
    declare public error: string;

    private _adopted: boolean | null = null;
    private _generation = 0;
    private readonly _uid = `hyperion-captcha-${++instances}`;

    public constructor() {
        super();
        this.formId = '';
        this.refreshUrl = '';
        this.imageSrc = '';
        this.imageWidth = 0;
        this.imageHeight = 0;
        this.caseSensitive = false;
        this.required = false;
        this.name = '';
        this.label = 'Please type the letters and numbers below';
        this.reloadLabel = 'Reload captcha';
        this.caseNote = 'The code is case sensitive.';
        this.error = '';
        this._onInput = this._onInput.bind(this);
        this._onClick = this._onClick.bind(this);
    }

    /** What the shopper typed. */
    public get value(): string {
        return this._input()?.value ?? '';
    }

    public override connectedCallback(): void {
        if (this._adopted === null) {
            // Decided before the first render: afterwards the element's own
            // image would be found here.
            this._adopted = this._image() !== null && this._input() !== null;
        }
        super.connectedCallback();
        this.addEventListener('input', this._onInput);
        this.addEventListener('click', this._onClick);
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this.removeEventListener('input', this._onInput);
        this.removeEventListener('click', this._onClick);
    }

    public override focus(options?: FocusOptions): void {
        const input = this._input();
        if (input) {
            input.focus(options);
            return;
        }
        super.focus(options);
    }

    /** Empty the input. */
    public clear(): void {
        const input = this._input();
        if (!input || input.value === '') return;
        input.value = '';
        this._emitChange();
    }

    /**
     * Ask the storefront for a new image. The request is the one core's own
     * widget sends: a form post with `formId`, declared as an XHR so the
     * action accepts it without a form key.
     */
    public async refresh(): Promise<boolean> {
        if (!this.refreshUrl || !this.formId) return false;
        const generation = ++this._generation;
        this._setBusy(true);
        try {
            const response = await fetch(this.refreshUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
                body: new URLSearchParams({ formId: this.formId }),
            });
            if (!response.ok) throw new Error(`CAPTCHA refresh answered ${response.status}`);
            const data = (await response.json()) as { imgSrc?: unknown } | null;
            const src = typeof data?.imgSrc === 'string' ? data.imgSrc : '';
            if (generation !== this._generation) return false;
            if (!src) throw new Error('CAPTCHA refresh answered no image');
            this._applyImage(src);
            this.clear();
            return true;
        } catch (_error) {
            if (generation !== this._generation) return false;
            this.dispatchEvent(new CustomEvent<CaptchaRefreshErrorDetail>(CAPTCHA_REFRESH_ERROR_EVENT, {
                detail: { formId: this.formId },
                bubbles: true,
                composed: true,
            }));
            return false;
        } finally {
            if (generation === this._generation) this._setBusy(false);
        }
    }

    protected override render(): unknown {
        if (this._adopted) return nothing;
        const classes = (this.constructor as typeof CaptchaElement).classes;
        const inputId = `${this._uid}-input`;
        const noteId = `${this._uid}-note`;
        const errorId = `${this._uid}-error`;
        const describedBy = [this.caseSensitive ? noteId : '', this.error ? errorId : ''].filter(Boolean).join(' ');
        return html`
            <div class=${classes.root}>
                <label for=${inputId} class=${classes.label}>
                    ${this.label}
                    ${this.required ? html`<span aria-hidden="true" class=${classes.requiredMark}>*</span>` : nothing}
                </label>
                <div class=${classes.row}>
                    <img
                        data-hyperion-captcha-image
                        class=${classes.image}
                        src=${this.imageSrc || nothing}
                        width=${this.imageWidth || nothing}
                        height=${this.imageHeight || nothing}
                        alt=${this.label}
                    />
                    <button type="button" data-hyperion-captcha-reload class=${classes.reload}>
                        ${this.reloadLabel}
                    </button>
                </div>
                <input
                    type="text"
                    id=${inputId}
                    data-hyperion-captcha-input
                    name=${this.name || `captcha[${this.formId}]`}
                    class=${classes.input}
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    ?required=${this.required}
                    aria-invalid=${this.error ? 'true' : nothing}
                    aria-describedby=${describedBy || nothing}
                />
                ${this.caseSensitive ? html`<p id=${noteId} class=${classes.caseNote}>${this.caseNote}</p>` : nothing}
                ${this.error
                    ? html`<p id=${errorId} data-hyperion-captcha-error class=${classes.error}>${this.error}</p>`
                    : nothing}
            </div>
        `;
    }

    protected override firstUpdated(_changed: PropertyValues): void {
        if (!this._image()?.getAttribute('src')) {
            void this.refresh();
        }
    }

    protected override updated(changed: PropertyValues): void {
        if (!this._adopted) return;
        if (changed.has('imageSrc') && this.imageSrc) {
            this._applyImage(this.imageSrc);
        }
        if (changed.has('error')) {
            this._syncAdoptedError();
        }
    }

    private _image(): HTMLImageElement | null {
        return this.querySelector<HTMLImageElement>(IMAGE_SELECTOR);
    }

    private _input(): HTMLInputElement | null {
        return this.querySelector<HTMLInputElement>(INPUT_SELECTOR)
            ?? this.querySelector<HTMLInputElement>('input[type="text"]');
    }

    private _reload(): HTMLElement | null {
        return this.querySelector<HTMLElement>(RELOAD_SELECTOR);
    }

    private _applyImage(src: string): void {
        if (this._adopted) {
            this._image()?.setAttribute('src', src);
            return;
        }
        this.imageSrc = src;
    }

    /**
     * The Reload button stays focusable while a request runs (a disabled
     * button drops the keyboard focus), it only stops answering clicks.
     */
    private _setBusy(busy: boolean): void {
        const reload = this._reload();
        if (!reload) return;
        if (busy) {
            reload.setAttribute('aria-disabled', 'true');
        } else {
            reload.removeAttribute('aria-disabled');
        }
    }

    /** Adopted markup carries no message element: one is added after the input and kept for later messages. */
    private _syncAdoptedError(): void {
        const input = this._input();
        if (!input) return;
        const errorId = `${this._uid}-error`;
        let message = this.querySelector<HTMLElement>(ERROR_SELECTOR);
        if (!message && this.error) {
            message = document.createElement('p');
            message.id = errorId;
            message.setAttribute('data-hyperion-captcha-error', '');
            message.className = (this.constructor as typeof CaptchaElement).classes.error;
            input.insertAdjacentElement('afterend', message);
        }
        if (!message) return;
        if (!message.id) message.id = errorId;
        message.textContent = this.error;
        message.hidden = !this.error;
        const describedBy = describedByWithout(input, message.id);
        if (this.error) {
            describedBy.push(message.id);
            input.setAttribute('aria-invalid', 'true');
        } else {
            input.removeAttribute('aria-invalid');
        }
        if (describedBy.length) {
            input.setAttribute('aria-describedby', describedBy.join(' '));
        } else {
            input.removeAttribute('aria-describedby');
        }
    }

    private _emitChange(): void {
        this.dispatchEvent(new CustomEvent<CaptchaChangeDetail>(CAPTCHA_CHANGE_EVENT, {
            detail: { formId: this.formId, value: this.value },
            bubbles: true,
            composed: true,
        }));
    }

    private _onInput(event: Event): void {
        if (event.target === this._input()) this._emitChange();
    }

    private _onClick(event: Event): void {
        const reload = this._reload();
        if (!reload || !(event.target instanceof Node) || !reload.contains(event.target)) return;
        event.preventDefault();
        if (reload.getAttribute('aria-disabled') === 'true') return;
        void this.refresh();
    }
}
