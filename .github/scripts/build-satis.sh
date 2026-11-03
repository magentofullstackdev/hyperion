#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
#
# Builds the Hyperion Composer repository (Satis) into .satis/output.
#
# satis.json at the repository root describes ONE checkout: the twelve packages
# of the working tree, read through Composer path repositories. A Composer
# repository must offer every released version, so this script checks out
# every release tag (v*) into a git worktree, points one pair of path
# repositories at each worktree and runs Satis once over all of them. The
# result is rebuilt from scratch on every run: no state lives on GitHub Pages.
#
# Usage: .github/scripts/build-satis.sh [homepage-url]
#   The optional URL overrides "homepage" (the base of the dist archive URLs),
#   for a local test server for instance.
# Requires: git, jq, unzip, and either `satis` on the PATH or Docker (composer/satis).
# Path repository URLs are relative to the working directory (the repository
# root), which is where Satis runs.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
WORK=.satis
HOMEPAGE=${1:-}

rm -rf "$WORK"
mkdir -p "$WORK/tags"

# Each tag must carry its version in every composer.json: Composer path
# repositories read the "version" field, not the tag. A single manifest that
# lags would be archived under the wrong version and break the theme's
# self.version requirements, so every manifest of the tag is checked and a
# mismatch aborts the build instead of skipping the tag.
repos='[]'
for tag in $(git tag -l 'v*' --sort=version:refname); do
    git worktree add --detach "$WORK/tags/$tag" "$tag" >/dev/null 2>&1
    manifests=$(ls "$WORK/tags/$tag"/app/code/Magentofullstackdev/*/composer.json \
        "$WORK/tags/$tag"/app/design/frontend/Magentofullstackdev/*/composer.json)
    for manifest in $manifests; do
        version=$(jq -r '.version // empty' "$manifest")
        if [ "v$version" != "$tag" ]; then
            echo "abort $tag: ${manifest#"$WORK/tags/$tag/"} has version '$version'" >&2
            exit 1
        fi
    done
    version=${tag#v}
    for glob in 'app/code/Magentofullstackdev/*' 'app/design/frontend/Magentofullstackdev/*'; do
        repos=$(jq --arg url "$WORK/tags/$tag/$glob" \
            '. + [{"type": "path", "url": $url, "options": {"symlink": false}}]' <<<"$repos")
    done
    echo "tag $tag -> $version"
done

if [ "$repos" = '[]' ]; then
    echo "No release tag found: building the working tree only" >&2
    repos=$(jq '.repositories' satis.json)
fi

jq --argjson repos "$repos" --arg home "$HOMEPAGE" \
    '.repositories = $repos | if $home != "" then .homepage = $home else . end' \
    satis.json > "$WORK/satis.json"

if command -v satis >/dev/null 2>&1; then
    satis build "$WORK/satis.json" "$WORK/output" --no-interaction
else
    docker run --rm --user "$(id -u):$(id -g)" -v "$ROOT:/build" composer/satis \
        build "$WORK/satis.json" "$WORK/output" --no-interaction
fi

# Worktrees are only needed during the build.
for tag in $(git tag -l 'v*'); do
    [ -d "$WORK/tags/$tag" ] && git worktree remove --force "$WORK/tags/$tag"
done
git worktree prune

# Every archive is a self-contained Composer package: it must carry the MIT
# LICENSE, and the two packages that ship compiled JS bundles (the theme and
# HyperionCheckout) must also carry the THIRD_PARTY_LICENSES.txt that the
# frontend build writes next to the assets.
archives=$(find "$WORK/output/dist" -type f -name '*.zip' | sort)
if [ -z "$archives" ]; then
    echo "abort: no archive found under $WORK/output/dist" >&2
    exit 1
fi
failed=0
licenses=0
notices=0
for archive in $archives; do
    listing=$(unzip -Z1 "$archive")
    if ! grep -qx 'LICENSE' <<<"$listing"; then
        echo "abort: ${archive#"$WORK/output/"} has no LICENSE" >&2
        failed=1
    else
        licenses=$((licenses + 1))
    fi
    case $(basename "$archive") in
        *theme-hyperion-*|*module-hyperion-checkout-*)
            if ! grep -qE '(^|/)THIRD_PARTY_LICENSES\.txt$' <<<"$listing"; then
                echo "abort: ${archive#"$WORK/output/"} has no THIRD_PARTY_LICENSES.txt" >&2
                failed=1
            else
                notices=$((notices + 1))
            fi
            ;;
    esac
done
[ "$failed" -eq 0 ] || exit 1
echo "archives checked: $(wc -l <<<"$archives") (LICENSE in $licenses, THIRD_PARTY_LICENSES.txt in $notices)"

echo "Composer repository written to $WORK/output"
