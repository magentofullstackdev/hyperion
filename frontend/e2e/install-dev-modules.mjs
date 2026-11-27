#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Installs (or removes) the development modules of dev/modules/ on a Magento
// install, for the e2e scripts of the extension points.
//
//   node frontend/e2e/install-dev-modules.mjs <slotDir> [--remove] [--only=HyperionSamplePsp,HyperionSampleExtension]
//
// <slotDir> is the Magento install directory (Docker Compose project with
// php-fpm; the Magento root is /var/www/html). The modules are copied into
// app/code/Magentofullstackdev/ with `docker compose cp`, so the install's
// Composer repositories do not matter and nothing is required through
// Composer. Then, inside php-fpm as www-data: module:enable, setup:upgrade,
// setup:di:compile on an emptied generated/, the static deploy of the theme
// and a cache flush. `--remove` disables the modules, deletes their copies
// and runs the same steps. No npm or pnpm command runs: the modules need no
// rebuild of the Hyperion bundles.
//
// The storefront answers errors while the compilation runs: never use it on
// a store that serves visitors. Every switch of the modules defaults to off,
// so an installed module changes nothing until a script turns it on.
//
// Exit codes: 0 done, 1 a step failed (its output is printed), 2 bad arguments.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
    DEV_MODULES,
    DEV_MODULES_SOURCE,
    enabledModules,
    moduleDirName,
    phpFpm,
    resolveSlotDir,
} from './lib/dev-modules.mjs';

const TARGET = '/var/www/html/app/code/Magentofullstackdev';
const THEME = 'Magentofullstackdev/hyperion';

function usage(message) {
    if (message) console.error(message);
    console.error('Usage: node frontend/e2e/install-dev-modules.mjs <slotDir> [--remove] [--only=HyperionSamplePsp,HyperionSampleExtension]');
    process.exit(2);
}

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const positional = args.filter((arg) => !arg.startsWith('--'));
const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--remove' && !arg.startsWith('--only='));
if (unknown.length) usage(`Unknown option(s): ${unknown.join(', ')}`);
if (positional.length !== 1) usage('Pass exactly one <slotDir>.');

let slotDir;
try {
    slotDir = resolveSlotDir(positional[0]);
} catch (error) {
    usage(error.message);
}
if (!['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].some((file) => fs.existsSync(path.join(slotDir, file)))) {
    usage(`${slotDir} has no Docker Compose file.`);
}

const known = Object.values(DEV_MODULES);
let modules = known;
if (onlyArg) {
    const wanted = onlyArg.slice('--only='.length).split(',').map((name) => name.trim()).filter(Boolean);
    modules = wanted.map((name) => (name.startsWith('Magentofullstackdev_') ? name : `Magentofullstackdev_${name}`));
    const bad = modules.filter((name) => !known.includes(name));
    if (bad.length || !modules.length) usage(`Unknown module(s): ${bad.join(', ') || '(none)'}; known: ${known.map(moduleDirName).join(', ')}`);
}
for (const name of modules) {
    const source = path.join(DEV_MODULES_SOURCE, moduleDirName(name));
    if (!fs.existsSync(path.join(source, 'registration.php'))) usage(`No module source at ${source}.`);
}

/** One step: prints its name, runs it, ends the process with its output on failure. */
function step(label, run) {
    process.stdout.write(`- ${label} ... `);
    try {
        const output = run();
        console.log('ok');
        return output;
    } catch (error) {
        console.log('FAILED');
        const text = [error?.stdout, error?.stderr, error?.message].filter(Boolean).map(String).join('\n').trim();
        console.error(text.split('\n').slice(-25).join('\n'));
        process.exit(1);
    }
}

const magento = (command) => phpFpm(slotDir, `cd /var/www/html && php bin/magento ${command}`);
const asRoot = (command) => phpFpm(slotDir, command, { user: 'root' });
const names = modules.join(' ');
const dirs = modules.map((name) => `${TARGET}/${moduleDirName(name)}`);

console.log(`${remove ? 'Removing' : 'Installing'} ${modules.join(', ')} on ${slotDir}`);

if (remove) {
    const enabled = step('read module status', () => enabledModules(slotDir));
    const toDisable = modules.filter((name) => enabled.has(name));
    if (toDisable.length) step(`module:disable ${toDisable.join(' ')}`, () => magento(`module:disable ${toDisable.join(' ')}`));
    step('delete the module copies', () => asRoot(`rm -rf ${dirs.join(' ')} && (rmdir ${TARGET} 2>/dev/null || true)`));
} else {
    step('prepare app/code/Magentofullstackdev', () => asRoot(`mkdir -p ${TARGET} && rm -rf ${dirs.join(' ')}`));
    for (const name of modules) {
        step(`copy ${moduleDirName(name)}`, () => execFileSync(
            'docker',
            ['compose', '--project-directory', slotDir, 'cp', path.join(DEV_MODULES_SOURCE, moduleDirName(name)), `php-fpm:${TARGET}/`],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        ));
    }
    step('hand the copies to www-data', () => asRoot(`chown -R www-data:www-data ${TARGET}`));
    step(`module:enable ${names}`, () => magento(`module:enable ${names}`));
}

step('setup:upgrade', () => magento('setup:upgrade'));
step('empty generated/', () => asRoot('cd /var/www/html && rm -rf generated/code generated/metadata && mkdir -p generated && chown www-data:www-data generated'));
step('setup:di:compile', () => magento('setup:di:compile'));
step(`static deploy of ${THEME}`, () => phpFpm(slotDir, [
    'cd /var/www/html',
    'find pub/static -xtype l -delete',
    `rm -rf pub/static/frontend/${THEME} var/view_preprocessed/pub/static/frontend/${THEME}`,
    `php bin/magento setup:static-content:deploy -f --theme ${THEME}`,
].join(' && ')));
step('cache:flush', () => magento('cache:flush'));
try {
    execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', 'varnish', 'varnishadm', 'ban', 'req.url ~ .'], { stdio: 'ignore' });
    console.log('- varnish banned');
} catch {
    console.log('- no varnish to ban');
}

const enabledAfter = step('read module status', () => enabledModules(slotDir));
const wrong = modules.filter((name) => enabledAfter.has(name) === remove);
if (wrong.length) {
    console.error(`Unexpected module status after the run: ${wrong.join(', ')} ${remove ? 'still enabled' : 'not enabled'}.`);
    process.exit(1);
}
console.log(remove ? 'Removed. Their configuration rows and the nullable hyperion_sample_locker_id columns stay.' : 'Installed. Every switch is off until a script turns it on.');
