// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Recipient rows of the Email a Friend form (Magento_SendFriend::send.phtml).
//
// Core builds the rows in the browser with a RequireJS row builder. The
// Hyperion template renders every row up to the configured maximum on the
// server; the rows above the first (or above the data of a validation round
// trip) are hidden with their inputs disabled, so they neither submit nor
// block the native `required` validation. "Add Invitee" reveals the next
// hidden row and focuses its first field, "Remove" hides a row again and
// clears it. The add button goes when every row is open, the remove buttons
// while a single row is open. Delegated on the root, idempotent per root.

const ROOT = '[data-hyperion-sendfriend]';
const ROW = '[data-hyperion-sendfriend-recipient]';
const ADD = '[data-hyperion-sendfriend-add]';
const REMOVE = '[data-hyperion-sendfriend-remove]';
const FIELDS = 'input, textarea, select';

const installed = new WeakSet();

const rows = (form) => [...form.querySelectorAll(ROW)];
const openRows = (form) => rows(form).filter((row) => !row.hidden);

function setRowOpen(row, open) {
    row.hidden = !open;
    row.querySelectorAll(FIELDS).forEach((field) => {
        field.disabled = !open;
        if (!open) field.value = '';
    });
}

export function syncRecipientRows(form) {
    const all = rows(form);
    const open = openRows(form);
    const add = form.querySelector(ADD);
    if (add) add.hidden = open.length >= all.length;
    all.forEach((row) => {
        const remove = row.querySelector(REMOVE);
        if (remove) remove.hidden = open.length <= 1;
    });
}

export function addRecipientRow(form) {
    const next = rows(form).find((row) => row.hidden);
    if (!next) return null;
    setRowOpen(next, true);
    syncRecipientRows(form);
    next.querySelector(FIELDS)?.focus();
    return next;
}

export function removeRecipientRow(form, row) {
    if (openRows(form).length <= 1) return;
    setRowOpen(row, false);
    syncRecipientRows(form);
    const target = form.querySelector(ADD);
    if (target && !target.hidden) target.focus();
    else openRows(form).at(-1)?.querySelector(FIELDS)?.focus();
}

export function installSendFriend(root = document) {
    if (installed.has(root)) return () => {};
    installed.add(root);

    const onClick = (event) => {
        const button = event.target.closest(`${ADD}, ${REMOVE}`);
        const form = button?.closest(ROOT);
        if (!form) return;
        event.preventDefault();
        if (button.matches(ADD)) addRecipientRow(form);
        else removeRecipientRow(form, button.closest(ROW));
    };

    root.querySelectorAll(ROOT).forEach(syncRecipientRows);
    root.addEventListener('click', onClick);

    return () => {
        root.removeEventListener('click', onClick);
        installed.delete(root);
    };
}
