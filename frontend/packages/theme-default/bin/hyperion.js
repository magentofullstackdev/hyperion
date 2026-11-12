#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion -- scaffolding CLI shipped with @magentofullstackdev/hyperion-theme.
 *
 *   npx -p @magentofullstackdev/hyperion-theme hyperion create Vendor/Theme
 *   npx hyperion create Vendor/Theme        (only inside a project that has this
 *                                            package installed locally; elsewhere
 *                                            npx fetches an unrelated "hyperion")
 *
 * Run it from the Magento root: it writes a child theme of
 * Magentofullstackdev/hyperion into app/design/frontend/<Vendor>/<Theme>/,
 * pre-wired for Vite + Tailwind + the Hyperion npm packages. No runtime
 * dependencies: Node 22+ built-ins only (the `engines` field of the package).
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PARENT_THEME = 'Magentofullstackdev/hyperion';

// Pins that keep the child theme's dependency graph clear of the advisories
// of the Hyperion workspace (frontend/package.json, `pnpm.overrides`): the
// first two are build-time dependencies of Tailwind / PostCSS, the other two
// only matter when a test runner is added. Written as npm `overrides` and
// as `pnpm.overrides` so both package managers honour them.
const DEPENDENCY_OVERRIDES = {
    'source-map-js': '>=1.2.2',
    'postcss-selector-parser': '^6.1.5',
    tinypool: '>=2.1.2',
    'minimatch@9': '>=9.0.9',
};
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

// `npx hyperion create ... | head` closes stdout early; exit quietly instead
// of dumping a stack trace for the broken pipe.
process.stdout.on('error', (error) => {
    if (error && error.code === 'EPIPE') process.exit(0);
    throw error;
});

const ownPackage = JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')
);
const HYPERION_VERSION = ownPackage.version;

// ---------------------------------------------------------------------------
// CLI plumbing
// ---------------------------------------------------------------------------

function usage() {
    return `hyperion ${HYPERION_VERSION}

Usage:
  hyperion create <Vendor>/<Theme> [--force]

Commands:
  create      Scaffold a Magento 2 child theme of ${PARENT_THEME} into
              app/design/frontend/<Vendor>/<Theme>/ (relative to the current
              directory, which should be your Magento root).

Options:
  --force     Write into a directory that already exists (files are overwritten).
  -h, --help  Show this help.
  -v, --version
`;
}

function fail(message) {
    process.stderr.write(`hyperion: ${message}\n`);
    process.exit(1);
}

function parseArgs(argv) {
    const args = { command: null, positional: [], force: false, help: false, version: false };
    for (const arg of argv) {
        if (arg === '--force') args.force = true;
        else if (arg === '-h' || arg === '--help') args.help = true;
        else if (arg === '-v' || arg === '--version') args.version = true;
        else if (arg.startsWith('-')) fail(`unknown option "${arg}"\n\n${usage()}`);
        else if (args.command === null) args.command = arg;
        else args.positional.push(arg);
    }
    return args;
}

function parseThemeName(raw) {
    if (!raw) fail(`missing theme name.\n\n${usage()}`);
    const parts = raw.split('/');
    if (parts.length !== 2) fail(`theme name must be "<Vendor>/<Theme>", got "${raw}".`);
    const [vendor, theme] = parts;
    for (const part of [vendor, theme]) {
        if (!NAME_PATTERN.test(part)) {
            fail(`"${part}" is not a valid name: use letters, digits and underscores, starting with a letter.`);
        }
    }
    if (`${vendor}/${theme}` === PARENT_THEME) fail(`"${raw}" is the parent theme itself.`);
    return { vendor, theme };
}

// ---------------------------------------------------------------------------
// File templates
// ---------------------------------------------------------------------------

function slug(value) {
    return value.toLowerCase().replace(/_+/g, '-');
}

function templates({ vendor, theme }) {
    const code = `${vendor}_${theme}`;
    const path = `${vendor}/${theme}`;
    const blockName = `${slug(vendor)}.${slug(theme)}.assets`;

    return {
        'registration.php': `<?php
// Theme registration for Magento's component registrar.
use Magento\\Framework\\Component\\ComponentRegistrar;

ComponentRegistrar::register(
    ComponentRegistrar::THEME,
    'frontend/${path}',
    __DIR__
);
`,

        'theme.xml': `<?xml version="1.0"?>
<theme xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xsi:noNamespaceSchemaLocation="urn:magento:framework:Config/etc/theme.xsd">
    <title>${theme} by ${vendor}</title>
    <parent>${PARENT_THEME}</parent>
</theme>
`,

        'package.json': `${JSON.stringify(
            {
                name: `${slug(vendor)}-${slug(theme)}`,
                version: '1.0.0',
                private: true,
                description: `Magento 2 child theme of ${PARENT_THEME} (${code})`,
                type: 'module',
                scripts: {
                    build: 'vite build',
                    dev: 'vite build --watch',
                },
                dependencies: {
                    '@magentofullstackdev/hyperion-shared': `^${HYPERION_VERSION}`,
                    '@magentofullstackdev/hyperion-theme': `^${HYPERION_VERSION}`,
                    // Declared here, not only inherited through the theme package:
                    // pnpm's strict node_modules does not hoist it, so a component
                    // importing from 'lit' would fail to resolve under pnpm.
                    lit: '^3.1.2',
                },
                devDependencies: {
                    '@tailwindcss/typography': '^0.5.19',
                    autoprefixer: '^10.4.19',
                    postcss: '^8.4.38',
                    tailwindcss: '^3.4.3',
                    vite: '^6.4.5',
                },
                overrides: DEPENDENCY_OVERRIDES,
                pnpm: {
                    overrides: DEPENDENCY_OVERRIDES,
                    // pnpm 10 runs no dependency lifecycle script unless it is
                    // allowlisted and prints "Ignored build scripts: esbuild"
                    // otherwise. esbuild's postinstall only places its native
                    // binary (Vite needs it); nothing else is enabled.
                    onlyBuiltDependencies: ['esbuild'],
                },
            },
            null,
            4
        )}\n`,

        'tailwind.config.js': `// Tailwind configuration for ${path}.
//
// The Hyperion preset supplies the semantic color tokens (bg-primary,
// text-muted, border-subtle, ...) so classes in your templates resolve
// exactly like in the parent theme. Only THIS theme's files are scanned:
// utilities used by parent templates are already served by the parent's
// stylesheet, this build adds only what your overrides need. Every module
// directory counts (Magento_*, Magentofullstackdev_Hyperion*, MageOS_*).
import hyperionPreset from '@magentofullstackdev/hyperion-shared/tailwind/preset';

/** @type {import('tailwindcss').Config} */
export default {
    presets: [hyperionPreset],
    content: [
        './*/templates/**/*.phtml',
        './*/layout/**/*.xml',
        './src/**/*.{js,ts}',
    ],
};
`,

        'postcss.config.js': `// Vite runs Tailwind through PostCSS; keep this file next to vite.config.js.
export default {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
    },
};
`,

        'vite.config.js': `// Vite configuration for ${path}.
//
// Builds src/js/entry.js (which imports src/css/entry.css) into web/assets/.
// The two entry files keep FIXED names (entry.js, entry.css): the layout
// template Magento_Theme/templates/html/theme-assets.phtml links them through
// $block->getViewFileUrl(), and Magento's static-content signing
// (/static/version<ts>/...) already cache-busts everything under web/.
//
// Every other file the build splits off (a chunk behind a dynamic import(),
// its stylesheet, a font or image) gets a hashed name, <name>.<hash>.js.
// Keep that shape: the entry imports its chunks by file name, and Hyperion
// excludes hashed files under an assets/ directory from Magento's JS / CSS
// minification, which would otherwise publish them as <name>.min.js and
// break those imports. The entry files may be minified by Magento:
// getViewFileUrl() then links entry.min.js / entry.min.css by itself.
//
// The parent theme's bundle (components, HTMX, base stylesheet) is loaded
// by Magentofullstackdev/hyperion itself; this build only carries your
// additions on top of it.
import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const themeDir = dirname(fileURLToPath(import.meta.url));

// The stylesheet of the entry is the one asset the layout links by name.
const isEntryStylesheet = (asset) => (asset.names ?? [asset.name]).includes('entry.css');

export default defineConfig({
    root: themeDir,
    publicDir: false,
    base: './',
    build: {
        outDir: resolve(themeDir, 'web/assets'),
        emptyOutDir: true,
        manifest: false,
        sourcemap: true,
        // One stylesheet per entry or chunk, named after it (web/assets/entry.css).
        cssCodeSplit: true,
        rollupOptions: {
            input: {
                entry: resolve(themeDir, 'src/js/entry.js'),
            },
            output: {
                format: 'es',
                entryFileNames: '[name].js',
                chunkFileNames: '[name].[hash].js',
                assetFileNames: (asset) => (isEntryStylesheet(asset) ? '[name][extname]' : '[name].[hash][extname]'),
            },
        },
    },
});
`,

        'src/js/entry.js': `// ${path} -- theme entry.
//
// The parent theme already registers every <hyperion-*> component and HTMX.
// Import your own Lit components or plain modules here. To reuse the
// Hyperion base class for light-DOM components:
//
//   import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';
//
import '../css/entry.css';
`,

        'src/css/entry.css': `/* ${path} -- theme stylesheet.
 *
 * Tailwind base styles (preflight) come from the parent theme; only the
 * components and utilities layers are generated here, for the classes used
 * in this theme's own templates and scripts. Add custom rules below or
 * override the color tokens declared by @magentofullstackdev/hyperion-shared/tokens/colors.css:
 *
 *   :root { --color-primary: 220 38 38; }
 */
@tailwind components;
@tailwind utilities;
`,

        'Magento_Theme/layout/default.xml': `<?xml version="1.0"?>
<!--
    Loads this theme's built assets (web/assets/entry.css + entry.js) right
    after the parent's head scripts block on every page.
-->
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
    <body>
        <referenceContainer name="after.body.start">
            <block class="Magento\\Framework\\View\\Element\\Template"
                   name="${blockName}"
                   template="Magento_Theme::html/theme-assets.phtml"
                   after="hyperion.head.scripts"/>
        </referenceContainer>
    </body>
</page>
`,

        'Magento_Theme/templates/html/theme-assets.phtml': `<?php
/**
 * ${path} -- links the Vite build output. Paths resolve through the
 * current theme's static directory, so Magento's static signing and
 * setup:static-content:deploy handle cache busting and materialization.
 *
 * @var \\Magento\\Framework\\View\\Element\\Template $block
 * @var \\Magento\\Framework\\Escaper $escaper
 */
?>
<link rel="stylesheet" href="<?= $escaper->escapeUrl($block->getViewFileUrl('assets/entry.css')) ?>" media="all">
<script type="module" src="<?= $escaper->escapeUrl($block->getViewFileUrl('assets/entry.js')) ?>"></script>
`,

        'README.md': `# ${path}

Magento 2 child theme of \`${PARENT_THEME}\`, scaffolded by \`hyperion create\`.

## Build

\`\`\`bash
cd app/design/frontend/${path}
npm install
npm run build      # or: npm run dev (rebuild on change)
\`\`\`

Then, from the Magento root:

\`\`\`bash
bin/magento setup:upgrade
bin/magento cache:flush
\`\`\`

Assign the theme in Content > Design > Configuration. In production mode run
\`bin/magento setup:static-content:deploy\` after every build.

## Where things go

- \`<Module_Name>/templates/**\`: template overrides (same paths as the parent theme, \`Magento_*\` and \`Magentofullstackdev_Hyperion*\` alike).
- \`src/css/entry.css\`, \`src/js/entry.js\`: your styles and scripts, built to \`web/assets/\`.
- \`tailwind.config.js\`: scans this theme only; the Hyperion preset provides the semantic tokens.
`,
    };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function create(args) {
    const name = parseThemeName(args.positional[0]);
    const path = `${name.vendor}/${name.theme}`;
    const magentoRoot = process.cwd();
    const designRoot = join(magentoRoot, 'app', 'design', 'frontend');
    const destination = join(designRoot, name.vendor, name.theme);

    if (!existsSync(join(magentoRoot, 'app'))) {
        process.stdout.write(
            `Note: no app/ directory in ${magentoRoot}; this does not look like a Magento root, creating app/design/frontend anyway.\n`
        );
    }
    if (existsSync(destination) && readdirSync(destination).length > 0 && !args.force) {
        fail(`${destination} already exists and is not empty (use --force to overwrite).`);
    }

    process.stdout.write(`Creating theme ${path} in ${destination}\n`);

    const files = templates(name);
    for (const [relative, content] of Object.entries(files)) {
        const absolute = join(destination, relative);
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, content);
        process.stdout.write(`  + ${relative}\n`);
    }

    process.stdout.write(`
Done! Next steps:
  cd app/design/frontend/${path}
  npm install
  npm run build
  cd - && bin/magento setup:upgrade && bin/magento cache:flush
Then assign "${name.theme} by ${name.vendor}" in Content > Design > Configuration.
`);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.version) {
        process.stdout.write(`${HYPERION_VERSION}\n`);
        return;
    }
    if (args.help || !args.command) {
        process.stdout.write(usage());
        if (!args.command && !args.help) process.exit(1);
        return;
    }
    if (args.command === 'create') {
        create(args);
        return;
    }
    fail(`unknown command "${args.command}"\n\n${usage()}`);
}

main();
