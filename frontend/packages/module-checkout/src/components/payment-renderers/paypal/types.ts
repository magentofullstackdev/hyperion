// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The part of the PayPal JS SDK the PayPal Express renderer uses.
 */
export interface PaypalClickActions {
    resolve(): unknown;
    reject(): unknown;
}

export interface PaypalClickData {
    fundingSource?: string;
}

export interface PaypalApproveData {
    orderID: string;
    payerID?: string | null;
}

export interface PaypalButtonsOptions {
    style: Readonly<Record<string, string>>;
    onClick(data: PaypalClickData, actions: PaypalClickActions): unknown;
    createOrder(): Promise<string>;
    onApprove(data: PaypalApproveData): Promise<void>;
    onCancel(): void;
    onError(err: unknown): void;
}

export interface PaypalButtonsInstance {
    isEligible?: () => boolean;
    render(container: HTMLElement): Promise<void>;
    close?: () => Promise<void>;
}

export interface PaypalMessagesInstance {
    render(container: HTMLElement): Promise<void>;
}

export interface PaypalSdk {
    Buttons(options: PaypalButtonsOptions): PaypalButtonsInstance;
    Messages?: (options?: Readonly<Record<string, unknown>>) => PaypalMessagesInstance;
}
