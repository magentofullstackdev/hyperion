# @magentofullstackdev/hyperion-shared

Shared design tokens, Tailwind preset, and base Lit element / mixins for the
[Hyperion](https://github.com/magentofullstackdev/hyperion) Magento 2 theme
suite.

This package is published as TypeScript / CSS source (a beta, `0.9.0-beta.x`,
versioned with the suite). It has no build step: sibling packages
(`@magentofullstackdev/hyperion-theme`, `@magentofullstackdev/hyperion-checkout`)
consume it directly through their own bundler (Vite). Installing it does not
install or activate anything in Magento; the storefront comes from the
Composer packages, see
[`docs/install.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/install.md).

## Install

```bash
npm install @magentofullstackdev/hyperion-shared
```

## Usage

Tailwind preset:

```ts
// tailwind.config.ts
import hyperionPreset from '@magentofullstackdev/hyperion-shared/tailwind/preset';

export default {
    presets: [hyperionPreset],
    content: ['./src/**/*.{ts,tsx,js,html}'],
};
```

Design tokens (CSS):

```css
/* your-theme.css */
@import "@magentofullstackdev/hyperion-shared/tokens/index.css";
```

Base Lit element:

```ts
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';

class MyComponent extends HyperionLightElement {
    /* ... */
}
```

## Exports

| Subpath | Purpose |
|---|---|
| `.` | Barrel: `tailwindPreset`, base Lit element, mixins |
| `./tailwind/preset` | Tailwind 3.x preset (semantic colours, spacing, typography) |
| `./tokens/*` | Raw CSS custom properties (`colors.css`, `spacing.css`, `typography.css`, `index.css`) |
| `./lit` / `./lit/*` | Base Lit element + mixins |
| `./html` | HTML sanitizer (allowlist) used for cookie and response HTML |

## Requirements

A TypeScript-aware bundler (Vite, esbuild, webpack with `ts-loader`, etc.).
This package ships `.ts` source, not pre-compiled JavaScript, so it cannot be
loaded directly by Node.

## Links

- Website: <https://hyperionfront.dev>
- Live demo: <https://demo.hyperionfront.dev>
- Repository: <https://github.com/magentofullstackdev/hyperion>
- Changelog: [`CHANGELOG.md`](https://github.com/magentofullstackdev/hyperion/blob/main/CHANGELOG.md) in the main repo
- Issues: <https://github.com/magentofullstackdev/hyperion/issues>
- Documentation: `docs/child-themes.md` in the main repo (design tokens, base element)

## License

MIT, see [LICENSE](./LICENSE).
