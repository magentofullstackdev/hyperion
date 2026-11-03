// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Radio group primitive. Renders provided options; selection change
 * emits `value-change` with `{ value, name }`.
 */
import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

export interface RadioOption {
    value: string;
    label: string;
    secondary?: string;
    disabled?: boolean;
}

export class RadioGroup extends LitElement {
    @property({ type: String }) public label = '';
    @property({ type: String }) public name = '';
    @property({ type: String }) public value = '';
    @property({ type: Array }) public options: readonly RadioOption[] = [];

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const labelId = `hc-rg-${this.name || Math.random().toString(36).slice(2)}`;
        return html`
            <div role="radiogroup" aria-labelledby=${labelId}>
                ${this.label
                    ? html`<p id=${labelId} class="block text-sm font-medium text-brand mb-2">${this.label}</p>`
                    : null}
                <div class="space-y-2">
                    ${this.options.map((opt) => {
                        const id = `${labelId}-${opt.value}`;
                        const selected = this.value === opt.value;
                        return html`
                            <label
                                for=${id}
                                class="flex items-start gap-3 rounded-md border p-3 cursor-pointer ${selected
                                    ? 'border-accent bg-accent/5'
                                    : 'border-subtle bg-surface'} ${opt.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent'}"
                            >
                                <input
                                    id=${id}
                                    type="radio"
                                    name=${this.name}
                                    value=${opt.value}
                                    class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                                    .checked=${selected}
                                    ?disabled=${opt.disabled}
                                    @change=${this._onChange}
                                />
                                <span class="flex-1">
                                    <span class="block text-sm font-medium text-brand">${opt.label}</span>
                                    ${opt.secondary
                                        ? html`<span class="block text-xs text-muted mt-0.5">${opt.secondary}</span>`
                                        : null}
                                </span>
                            </label>
                        `;
                    })}
                </div>
            </div>
        `;
    }

    private _onChange(e: Event): void {
        const target = e.target as HTMLInputElement;
        this.value = target.value;
        this.dispatchEvent(new CustomEvent('value-change', {
            detail: { value: target.value, name: this.name },
            bubbles: true,
            composed: true,
        }));
    }
}

if (!customElements.get('hc-radio-group')) {
    customElements.define('hc-radio-group', RadioGroup);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-radio-group': RadioGroup; }
}
