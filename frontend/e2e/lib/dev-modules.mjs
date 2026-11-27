// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The development modules under dev/modules/ (a sample payment provider and a
// sample extension) and the guard the e2e scripts that need them call first.
// The scripts never install them silently: a missing module stops the run
// with exit code 2 and the command that installs it
// (frontend/e2e/install-dev-modules.mjs).
//
// <slotDir> is the Magento install directory: a Docker Compose project with
// the php-fpm service, the Magento root mounted at /var/www/html.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the repository (frontend/e2e/lib/ is three levels down). */
export const REPO_ROOT = path.resolve(here, '..', '..', '..');

/** Where the module sources live: one directory per module, named like the module without the vendor. */
export const DEV_MODULES_SOURCE = path.join(REPO_ROOT, 'dev', 'modules', 'Magentofullstackdev');

/** Module names, for `requireDevModules(slotDir, [DEV_MODULES.psp])`. */
export const DEV_MODULES = Object.freeze({
    psp: 'Magentofullstackdev_HyperionSamplePsp',
    extension: 'Magentofullstackdev_HyperionSampleExtension',
});

/** Directory of a module under DEV_MODULES_SOURCE and under app/code/Magentofullstackdev/. */
export function moduleDirName(moduleName) {
    return moduleName.replace(/^Magentofullstackdev_/, '');
}

/**
 * The install directory of an argument: an existing directory as given, else
 * a directory of that name next to the repository (so a bare install name works
 * from a workspace that keeps the installs beside the repository).
 */
export function resolveSlotDir(argument) {
    if (!argument) throw new Error('missing <slotDir> (the Magento install directory)');
    const direct = path.resolve(argument);
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;
    const sibling = path.resolve(REPO_ROOT, '..', argument);
    if (fs.existsSync(sibling) && fs.statSync(sibling).isDirectory()) return sibling;
    throw new Error(`no install directory at ${direct} or ${sibling}`);
}

/**
 * Runs a shell command inside php-fpm and returns its output. stdin is closed,
 * so the call is safe inside loops.
 */
export function phpFpm(slotDir, command, { user = 'www-data' } = {}) {
    return execFileSync(
        'docker',
        ['compose', '--project-directory', slotDir, 'exec', '-T', '--user', user, 'php-fpm', 'bash', '-c', command],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }
    );
}

/** The enabled modules of the install, read from `bin/magento module:status --enabled`. */
export function enabledModules(slotDir) {
    const output = phpFpm(slotDir, 'cd /var/www/html && php bin/magento module:status --enabled');
    return new Set(output.split('\n').map((line) => line.trim()).filter((line) => /^[A-Za-z0-9]+_[A-Za-z0-9]+$/.test(line)));
}

/** The command that installs the development modules on the install. */
export function installCommand(slotDir) {
    return `node ${path.relative(process.cwd(), path.join(REPO_ROOT, 'frontend', 'e2e', 'install-dev-modules.mjs')) || 'frontend/e2e/install-dev-modules.mjs'} ${slotDir}`;
}

/**
 * Stops the process with exit code 2 unless every named module is installed
 * and enabled; prints the command that installs them. Returns nothing when
 * they are all there.
 */
export function requireDevModules(slotDir, names = Object.values(DEV_MODULES)) {
    let enabled;
    try {
        enabled = enabledModules(slotDir);
    } catch (error) {
        console.error(`Could not read the module status of ${slotDir}: ${String(error?.stderr || error?.message || error).trim()}`);
        process.exit(2);
    }
    const missing = names.filter((name) => !enabled.has(name));
    if (missing.length === 0) return;
    console.error(`Missing or disabled development module(s): ${missing.join(', ')}.`);
    console.error(`Install them first (this compiles the install, the storefront is down meanwhile):\n  ${installCommand(slotDir)}`);
    process.exit(2);
}
