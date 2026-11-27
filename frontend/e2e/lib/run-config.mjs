// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Default-scope settings changed for part of a run, for the scripts that do
// not use `harness.mjs`. The first change of a setting snapshots what is
// stored (no row, SQL NULL or a value, see `config-snapshot.mjs`); `restore`
// puts one setting back, `restoreAll` every setting still changed. `onAbort`
// registers the undo of anything else the run created (a fixture, a file, a
// customer). An interrupted run (SIGINT, SIGTERM, SIGHUP) runs the registered
// undo steps in reverse order (a failing one does not skip the others), then
// restores every setting, flushes and exits 130: the caller's `finally` does
// not run then. The caller flushes the caches after `set` and `restore`.
import { makeConfigSnapshot } from './config-snapshot.mjs';

/**
 * @param {(query: string) => string} sql one statement through the mysql client's `-N` output
 * @param {() => void} flush flushes the configuration cache and the page caches
 */
export function makeRunConfig(sql, flush) {
    const { configSnapshot, restoreConfig, describe } = makeConfigSnapshot(sql);
    const changed = new Map();

    /** Stores a value for the run (null removes the row: the value comes from config.xml). */
    const set = (configPath, value) => {
        if (!changed.has(configPath)) changed.set(configPath, configSnapshot(configPath));
        if (value === null) {
            sql(`delete from core_config_data where scope = 'default' and scope_id = 0 and path = '${configPath}'`);
            return;
        }
        restoreConfig(configPath, { state: 'value', value: String(value) });
    };
    /** Puts one setting back as it was found; nothing when the run did not change it. */
    const restore = (configPath) => {
        const snapshot = changed.get(configPath);
        if (!snapshot) return;
        restoreConfig(configPath, snapshot);
        changed.delete(configPath);
        console.log(`restored: ${configPath} (${describe(snapshot)})`);
    };
    /** Every setting still changed; returns the paths whose restore failed. */
    const restoreAll = () => {
        const failed = [];
        for (const configPath of [...changed.keys()]) {
            try {
                restore(configPath);
            } catch (e) {
                failed.push(configPath);
                console.error(`RESTORE FAILED: ${configPath}: ${String(e?.message ?? e).split('\n')[0]}`);
            }
        }
        return failed;
    };
    const abortSteps = [];
    /**
     * Registers what an interrupted run must undo besides the settings. Returns the function that unregisters it,
     * for the caller to call once its own clean-up has done the same work.
     */
    const onAbort = (label, undo) => {
        const entry = { label, undo };
        abortSteps.push(entry);
        return () => {
            const index = abortSteps.indexOf(entry);
            if (index >= 0) abortSteps.splice(index, 1);
        };
    };
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(signal, () => {
            console.error(`\n${signal}: undoing the changes of the run`);
            while (abortSteps.length) {
                const { label, undo } = abortSteps.pop();
                try {
                    undo();
                    console.log(`undone: ${label}`);
                } catch (e) {
                    console.error(`UNDO FAILED: ${label}: ${String(e?.message ?? e).split('\n')[0]}`);
                }
            }
            restoreAll();
            try { flush(); } catch { /* the caches are flushed by the next run */ }
            process.exit(130);
        });
    }
    return { set, restore, restoreAll, onAbort, pending: () => [...changed.keys()] };
}
