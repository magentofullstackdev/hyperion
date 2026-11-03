// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * THIRD_PARTY_LICENSES.txt of a Hyperion bundle.
 *
 * Composer consumers receive the committed build assets and never install
 * the npm packages they were built from, so the full license text of every
 * library that ends up in a bundle has to travel with the bundle. The file
 * is written by rollup-plugin-license while the bundle is generated, which
 * is why it survives `emptyOutDir` (a hand-made file under `web/` does not),
 * and it is a plain file write rather than an emitted asset: it never shows
 * up in the manifest.
 *
 * The plugin lists the packages whose code lands in a chunk. Two kinds of
 * package escape that scan and are listed by name through `extraPackages`:
 * one copied into the output outside the module graph (the htmx UMD copy of
 * the theme) and a facade whose modules only re-export (`lit`: its code is
 * that of lit-html, lit-element and @lit/reactive-element). A dependency
 * without a license text, or with a license outside the allow list, stops
 * the build: a new library then gets a human look before it ships.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import license from 'rollup-plugin-license';
import type { Dependency } from 'rollup-plugin-license';
import type { Plugin } from 'vite';

/** Packages of this repository: MIT, covered by the LICENSE file of every package. */
const OWN_SCOPE = '@magentofullstackdev/';

/** Licenses a bundled library may carry; anything else fails the build for a review. */
const ALLOWED_LICENSES = '(MIT OR BSD-3-Clause OR BSD-2-Clause OR 0BSD OR Apache-2.0 OR ISC)';

export interface ThirdPartyLicensesOptions {
    /** Absolute path of the file to write, inside the build output directory. */
    file: string;
    /** Name of the bundle, printed in the header. */
    bundle: string;
    /** Packages the chunk scan cannot see (copied files, re-export facades), by name. */
    extraPackages?: string[];
    /** `import.meta.url` of the calling Vite config: the extra packages resolve from there. */
    resolveFrom: string;
}

interface Entry {
    name: string;
    version: string;
    license: string;
    homepage: string;
    licenseText: string;
    /** NOTICE file of the package (Apache-2.0 asks for it to travel with the text). */
    noticeText: string | null;
}

function licenseFileOf(dir: string): string | null {
    const name = readdirSync(dir).find((file) => /^licen[cs]e(\.|$)/i.test(file));
    return name ? readFileSync(join(dir, name), 'utf8') : null;
}

interface Manifest {
    name: string;
    version: string;
    license?: string;
    homepage?: string;
}

/**
 * Root directory of an installed package: the entry module is resolved and
 * the tree walked up to the package.json that carries the package name
 * (`require.resolve('<name>/package.json')` is refused by an `exports` map
 * that does not list it, as lit's does).
 */
function packageRootOf(name: string, resolveFrom: string): string {
    const require = createRequire(resolveFrom);
    let dir = dirname(require.resolve(name));
    for (;;) {
        const manifestPath = join(dir, 'package.json');
        if (existsSync(manifestPath) && (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest).name === name) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) throw new Error(`${name}: package root not found`);
        dir = parent;
    }
}

function extraEntry(name: string, resolveFrom: string): Entry {
    const root = packageRootOf(name, resolveFrom);
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest;
    const licenseText = licenseFileOf(root);
    if (!licenseText) throw new Error(`${name}: no license file in its package`);
    return {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license ?? '',
        homepage: manifest.homepage ?? '',
        licenseText,
        noticeText: existsSync(join(root, 'NOTICE')) ? readFileSync(join(root, 'NOTICE'), 'utf8') : null,
    };
}

function bundledEntry(dependency: Dependency): Entry {
    const name = dependency.name ?? '';
    const version = dependency.version ?? '';
    if (!dependency.licenseText) {
        throw new Error(`${name}@${version}: no license text in its package`);
    }
    const repository = dependency.repository;
    const repositoryUrl = typeof repository === 'string' ? repository : (repository?.url ?? '');
    return {
        name,
        version,
        license: dependency.license ?? '',
        homepage: dependency.homepage ?? repositoryUrl,
        licenseText: dependency.licenseText,
        noticeText: dependency.noticeText,
    };
}

function render(bundle: string, entries: Entry[]): string {
    const rule = '='.repeat(72);
    const lines = [
        `Third-party licenses of the Hyperion ${bundle} bundle`,
        rule,
        '',
        'Generated by the frontend build (rollup-plugin-license): the full license',
        'text of every library that is part of the committed build assets of this',
        'package. The Hyperion packages themselves are MIT, see the LICENSE file',
        'of this package.',
        '',
    ];
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
    for (const entry of sorted) {
        lines.push(rule, `${entry.name} ${entry.version}`, `License: ${entry.license}`);
        if (entry.homepage) lines.push(entry.homepage);
        lines.push(rule, '', entry.licenseText.trim(), '');
        if (entry.noticeText) lines.push('NOTICE:', '', entry.noticeText.trim(), '');
    }
    // Some packages ship their license with CRLF endings (PhotoSwipe does);
    // the repository stores every text file with LF (.gitattributes), so a
    // mixed file would differ from the committed one at the next build.
    return `${lines.join('\n')}\n`.replace(/\r\n?/g, '\n');
}

export function thirdPartyLicensesPlugin(options: ThirdPartyLicensesOptions): Plugin {
    const extras = (options.extraPackages ?? []).map((name) => extraEntry(name, options.resolveFrom));
    const plugin = license({
        thirdParty: {
            includePrivate: false,
            includeSelf: false,
            multipleVersions: true,
            allow: { test: ALLOWED_LICENSES, failOnUnlicensed: true, failOnViolation: true },
            output: {
                file: options.file,
                template: (dependencies: Dependency[]) =>
                    render(options.bundle, [
                        ...dependencies
                            .filter((dependency) => !(dependency.name ?? '').startsWith(OWN_SCOPE))
                            .map(bundledEntry),
                        ...extras,
                    ]),
            },
        },
    });
    return { ...plugin, apply: 'build' } as Plugin;
}
