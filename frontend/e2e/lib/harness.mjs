// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Plumbing shared by the scripts that change an install for a run: the
// command line (`<baseUrl> <slotDir>` first, then `--only a,b` and `--shots
// dir`), the Magento install reached through `docker compose`, settings
// changed for a run and put back as they were found (also when the run is
// interrupted), and browser journeys that record every page error, HTTP 5xx
// and Content Security Policy violation. The checks print numbered PASS /
// FAIL lines; `finish()` prints the JSON summary (with `"passed":`) and exits
// 1 on any failure. Nothing in here knows a page of the store: selectors stay
// in the scripts.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { makeUrl, resolveUrlSuffix } from './url-suffix.mjs';
import { makeConfigSnapshot } from './config-snapshot.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ usage: string, parts: string[] }} options `parts` are the names `--only` accepts.
 */
export async function createHarness({ usage, parts }) {
    const args = process.argv.slice(2);
    const valueOf = (flag) => {
        const inline = args.find((a) => a.startsWith(flag + '='));
        if (inline) return inline.slice(flag.length + 1);
        const i = args.indexOf(flag);
        return i >= 0 ? args[i + 1] : undefined;
    };
    const positional = args.filter((a, i) => !a.startsWith('--') && !['--only', '--shots'].includes(args[i - 1]));
    const base = (positional[0] ?? '').replace(/\/$/, '');
    const slotArg = positional[1];
    if (!/^https?:\/\//.test(base) || !slotArg) {
        console.error(`usage: node ${process.argv[1].split('/').pop()} ${usage}`);
        process.exit(2);
    }
    const slotDir = path.resolve(slotArg);
    if (!existsSync(path.join(slotDir, 'compose.yaml')) && !existsSync(path.join(slotDir, 'docker-compose.yml'))) {
        console.error(`${slotDir} holds no Docker Compose project (the second argument is the Magento install directory)`);
        process.exit(2);
    }
    const only = (valueOf('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = only.filter((p) => !parts.includes(p));
    if (unknown.length) {
        console.error(`--only takes: ${parts.join(', ')} (unknown: ${unknown.join(', ')})`);
        process.exit(2);
    }
    const wants = (part) => only.length === 0 || only.includes(part);
    const shotsDir = valueOf('--shots') ? path.resolve(valueOf('--shots')) : null;
    if (shotsDir) mkdirSync(shotsDir, { recursive: true });
    const u = makeUrl(await resolveUrlSuffix(base));

    // ------------------------------------------------------------ checks
    const results = [];
    let scenario = '';
    const setScenario = (name) => { scenario = name; };
    const check = (name, ok, detail = '') => {
        const title = scenario && !name.startsWith(`${scenario}:`) ? `${scenario}: ${name}` : name;
        const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
        results.push({ name: title, ok: !!ok, detail: String(text).slice(0, 400) });
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(results.length).padStart(3)}  ${title}${text ? '  -- ' + String(text).slice(0, 400) : ''}`);
        return !!ok;
    };
    /** A check of an exact expectation: prints both values when they differ. */
    const expectEqual = (name, found, wanted) => check(name, JSON.stringify(found) === JSON.stringify(wanted),
        JSON.stringify(found) === JSON.stringify(wanted) ? '' : `expected ${JSON.stringify(wanted)}, found ${JSON.stringify(found)}`);
    const skip = (name, reason) => console.log(`SKIP       ${scenario ? scenario + ': ' : ''}${name}  -- ${reason}`);

    // ------------------------------------------------------------ the install
    const compose = (service, cmd, user) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...(user ? ['-u', user] : []), service, 'bash', '-c', cmd],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
    const sql = (query) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(query)} 2>/dev/null`).trim();
    const { configSnapshot, restoreConfig, describe } = makeConfigSnapshot(sql);
    const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const banVarnish = () => { try { compose('varnish', "varnishadm ban 'req.url ~ .' > /dev/null"); } catch { /* no Varnish on this install */ } };
    /** Configuration, layout, blocks and pages: every setting a run changes can show in a cached page. */
    const flushCaches = () => { magento('cache:flush > /dev/null'); banVarnish(); };
    const copyToPhp = (file, name = path.basename(file)) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', file, `php-fpm:/tmp/${name}`], { stdio: 'ignore' });

    // Everything a run changes registers its way back; the list runs at the end of a scenario, of the run
    // and when the run is interrupted.
    const cleanups = [];
    const runCleanups = (mark = 0) => {
        while (cleanups.length > mark) {
            const { label, undo } = cleanups.pop();
            try { undo(); console.log(`restored: ${label}`); } catch (e) { console.error(`RESTORE FAILED: ${label}: ${String(e?.message ?? e).slice(0, 300)}`); }
        }
    };
    /** Registers an undo step; returns the function that runs it early (once). */
    const onCleanup = (label, undo) => {
        const entry = { label, undo };
        cleanups.push(entry);
        return () => {
            const index = cleanups.indexOf(entry);
            if (index >= 0) { cleanups.splice(index, 1); entry.undo(); console.log(`restored: ${label}`); }
        };
    };
    /**
     * Sets default scope settings (null removes the row) and flushes; returns the function that puts back what
     * was stored before (row, SQL NULL or no row) and flushes again.
     */
    const withConfig = (label, values) => {
        const before = Object.keys(values).map((configPath) => [configPath, configSnapshot(configPath)]);
        const undoAll = () => { for (const [configPath, snapshot] of before) restoreConfig(configPath, snapshot); flushCaches(); };
        const restore = onCleanup(`${label} (${before.map(([p, s]) => `${p} was ${describe(s)}`).join(', ')})`, undoAll);
        for (const [configPath, value] of Object.entries(values)) {
            if (value === null) sql(`delete from core_config_data where scope = 'default' and scope_id = 0 and path = ${quote(configPath)}`);
            else sql(`insert into core_config_data (scope, scope_id, path, value) values ('default', 0, ${quote(configPath)}, ${quote(value)}) on duplicate key update value = ${quote(value)}`);
        }
        flushCaches();
        return restore;
    };
    /** Settings stored for a website or a store view win over the default scope: a run that sets them must know. */
    const scopedOverrides = (paths) => {
        const list = paths.map(quote).join(', ');
        const rows = sql(`select concat(scope, ':', scope_id, ' ', path, '=', ifnull(value, 'NULL')) from core_config_data where scope <> 'default' and path in (${list})`);
        return rows === '' ? [] : rows.split('\n');
    };
    let browser = null;
    const closeAll = async () => { await browser?.close().catch(() => {}); browser = null; };
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(signal, () => { console.error(`\n${signal}: restoring the install`); runCleanups(); process.exit(130); });
    }
    for (const event of ['uncaughtException', 'unhandledRejection']) {
        process.on(event, (error) => { console.error(`\n${event}: ${String(error?.stack ?? error).slice(0, 800)}\nrestoring the install`); runCleanups(); process.exit(1); });
    }

    // ------------------------------------------------------------ the browser
    // PW_HOST_RESOLVER="MAP shop.example 10.0.0.4" resolves an install's host that is not in /etc/hosts yet.
    const launchOptions = process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {};
    const DESKTOP = { viewport: { width: 1366, height: 1000 } };
    const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

    /**
     * A fresh browser context. `j.problems` collects page errors, HTTP 5xx (except the URLs added to `j.injected`)
     * and Content Security Policy violations of every page the context opens; `j.requests` every request URL with
     * its time; `j.bodies` the JSON bodies of the POST / PUT requests to REST.
     */
    const newJourney = async (options = {}) => {
        browser ??= await chromium.launch({ headless: true, ...launchOptions });
        const { phone = false, initScripts = [], ...contextOptions } = options;
        const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...(phone ? PHONE : DESKTOP), ...contextOptions });
        const j = { ctx, problems: [], csp: [], requests: [], bodies: [], injected: new Set(), inflight: 0, lastActivity: Date.now() };
        await ctx.exposeBinding('__hyperionE2eCsp', (source, violation) => {
            j.csp.push(violation);
            j.problems.push(`CSP ${violation.directive} blocked ${violation.blocked} on ${String(source.page?.url() ?? '').replace(base, '')}`);
        });
        await ctx.addInitScript(() => {
            document.addEventListener('securitypolicyviolation', (e) => {
                window.__hyperionE2eCsp?.({ directive: e.violatedDirective, blocked: String(e.blockedURI).slice(0, 160), disposition: e.disposition });
            });
        });
        for (const script of initScripts) await ctx.addInitScript(script);
        const page = await ctx.newPage();
        j.page = page;
        const watch = (p) => {
            p.on('pageerror', (e) => j.problems.push(`pageerror ${p.url().replace(base, '')}: ${String(e.message).slice(0, 160)}`));
            p.on('response', (r) => { if (r.status() >= 500 && !j.injected.has(r.url())) j.problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 120)}`); });
            p.on('request', (r) => {
                j.inflight++;
                j.lastActivity = Date.now();
                j.requests.push({ url: r.url(), method: r.method(), at: Date.now() });
                if (/\/rest\//.test(r.url()) && ['POST', 'PUT'].includes(r.method())) {
                    let body = null;
                    try { body = JSON.parse(r.postData() ?? 'null'); } catch { /* not JSON */ }
                    j.bodies.push({ url: r.url(), method: r.method(), body, at: Date.now() });
                }
            });
            const done = () => { j.inflight = Math.max(0, j.inflight - 1); j.lastActivity = Date.now(); };
            p.on('requestfinished', done);
            p.on('requestfailed', done);
        };
        watch(page);
        ctx.on('page', (p) => { if (p !== page) watch(p); });
        /** Resolves when no request ran for `quiet` ms, counted from this call at the earliest. */
        j.settled = async (quiet = 1500, timeout = 45000) => {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                if (j.inflight === 0 && Date.now() - Math.max(j.lastActivity, start) >= quiet) return true;
                await sleep(150);
            }
            return false;
        };
        j.mark = () => ({ requests: j.requests.length, bodies: j.bodies.length });
        j.requestsSince = (mark) => j.requests.slice(mark.requests);
        j.bodiesSince = (mark) => j.bodies.slice(mark.bodies);
        j.close = async () => { await ctx.close().catch(() => {}); };
        return j;
    };
    const shot = async (page, name) => {
        if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true }).catch(() => {});
    };
    const noProblems = (j, label) => check(`${label}: no page error, HTTP 5xx or Content Security Policy violation`, j.problems.length === 0, j.problems.slice(0, 5).join(' | '));

    /** Runs the named scenarios in order, each with its own cleanups; the summary and the exit code follow. */
    const runScenarios = async (scenarios, extra = () => ({})) => {
        try {
            for (const [name, run] of Object.entries(scenarios)) {
                if (!wants(name)) continue;
                setScenario(name);
                const mark = cleanups.length;
                try {
                    await run();
                } catch (e) {
                    check('scenario ran to its end', false, String(e?.message ?? e).split('\n')[0]);
                } finally {
                    runCleanups(mark);
                }
            }
        } finally {
            setScenario('');
            await closeAll();
            runCleanups();
        }
        const failed = results.filter((r) => !r.ok);
        console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, ...extra(), failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
        process.exit(failed.length ? 1 : 0);
    };

    return {
        args, base, u, slotDir, shotsDir, wants, valueOf,
        check, expectEqual, skip, setScenario,
        compose, magento, sql, quote, configSnapshot, restoreConfig, describe, flushCaches, banVarnish, copyToPhp,
        onCleanup, withConfig, scopedOverrides, runCleanups,
        newJourney, shot, noProblems, runScenarios,
    };
}

const REPOSITORY = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const MANIFESTS = {
    checkout: path.join(REPOSITORY, 'app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/.vite/manifest.json'),
    theme: path.join(REPOSITORY, 'app/design/frontend/Magentofullstackdev/hyperion/web/manifest.json'),
};

/**
 * Patterns of the built chunks of source modules (`name-<hash>.js` for the checkout, `name.<hash>.js` for the
 * theme), the names read from the committed manifests. The hash is matched by its shape only, so the check
 * holds whichever build the install serves. `sources` maps a label to `[manifest, source path]`; a source
 * missing from its manifest maps to null, so the caller can report it.
 */
export function builtChunkPatterns(sources) {
    const read = {};
    for (const [name, file] of Object.entries(MANIFESTS)) {
        try { read[name] = JSON.parse(readFileSync(file, 'utf8')); } catch { read[name] = {}; }
    }
    return Object.fromEntries(Object.entries(sources).map(([label, [manifest, source]]) => {
        const match = path.basename(read[manifest]?.[source]?.file ?? '').match(/^(.+)([.-])[A-Za-z0-9_-]{8}\.js$/);
        if (!match) return [label, null];
        const name = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return [label, new RegExp(`/${name}\\${match[2]}[A-Za-z0-9_-]{8}\\.js(\\?|$)`)];
    }));
}

/** The first element of `document.activeElement`, followed through open shadow roots. */
export function deepActiveElementDescription() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    if (!el || el === document.body) return null;
    return { tag: el.localName, id: el.id || '', name: el.getAttribute('name') || '', type: el.getAttribute('type') || '', host: el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host.localName : '' };
}
