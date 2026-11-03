// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';

export class LoadingOverlay extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const placing = getStore().isPlacingOrder.get();
        if (!placing) return null;
        return html`
            <div role="alert" aria-live="assertive"
                 class="fixed inset-0 z-50 bg-brand/60 flex items-center justify-center">
                <div class="bg-surface rounded-md p-6 shadow-lg max-w-sm text-center space-y-3">
                    <span class="inline-block w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin"></span>
                    <p class="text-sm font-medium text-brand">
                        ${t('Hyperion_Checkout::placing_order')}
                    </p>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('loading-overlay')) {
    customElements.define('loading-overlay', LoadingOverlay);
}

declare global {
    interface HTMLElementTagNameMap { 'loading-overlay': LoadingOverlay; }
}
