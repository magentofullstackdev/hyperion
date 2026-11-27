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
# index is written again on every run; the archives of the releases the
# published repository already serves are fetched from it and kept byte for
# byte, only the archives of a new release are built (see "Released archives").
#
# Usage: .github/scripts/build-satis.sh [homepage-url]
#   The optional URL overrides "homepage" (the base of the dist archive URLs),
#   for a local test server for instance.
#   HYPERION_PUBLISHED_REPOSITORY=<url> reads the released archives from another
#   address than the "homepage" of satis.json; set it to an empty value to build
#   every archive (a repository that was never published).
# Requires: git, jq, unzip, curl, sha1sum, and either `satis` on the PATH or Docker
# (composer/satis).
# Path repository URLs are relative to the working directory (the repository
# root), which is where Satis runs.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
WORK=.satis
HOMEPAGE=${1:-}

rm -rf "$WORK"
# A run that stopped half way leaves its worktrees registered.
git worktree prune
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

# Released archives. A Composer lock file records the checksum of every archive
# it installed. Satis archives a path repository with the file times of the
# checkout, so an archive that is built again keeps its URL and gets another
# checksum, and `composer install` from a lock file written before that build
# fails with "The checksum verification of the file failed" on every machine
# without a Composer cache. So the archives the published repository serves are
# fetched first: Satis does not build an archive that is already in its output
# directory, it reads the checksum of the file that is there.
PUBLISHED=${HYPERION_PUBLISHED_REPOSITORY-$(jq -r '.homepage // empty' satis.json)}
PUBLISHED=${PUBLISHED%/}
released="$WORK/released.tsv"
: > "$released"
fetch() {
    curl --fail --silent --show-error --location --retry 3 --retry-delay 2 --max-time 120 -o "$2" "$1"
}
if [ -z "$PUBLISHED" ]; then
    echo "HYPERION_PUBLISHED_REPOSITORY is empty: every archive is built, the released ones too" >&2
else
    mkdir -p "$WORK/published"
    if ! fetch "$PUBLISHED/packages.json" "$WORK/published/packages.json"; then
        echo "abort: $PUBLISHED/packages.json cannot be read, the released archives cannot be kept" >&2
        echo "       (a repository that was never published: HYPERION_PUBLISHED_REPOSITORY= $0)" >&2
        exit 1
    fi
    for name in $(jq -r '."available-packages"[]?' "$WORK/published/packages.json"); do
        meta="$WORK/published/${name//\//__}.json"
        if ! fetch "$PUBLISHED/p2/$name.json" "$meta"; then
            echo "abort: $PUBLISHED/p2/$name.json cannot be read" >&2
            exit 1
        fi
        jq -r --arg name "$name" '.packages[$name][]?
            | select((.dist.url // "") != "" and (.dist.shasum // "") != "")
            | [$name, .version, .dist.url, .dist.shasum] | @tsv' "$meta" >> "$released"
    done
    if [ ! -s "$released" ]; then
        echo "abort: $PUBLISHED lists no released archive" >&2
        exit 1
    fi
    while IFS=$'\t' read -r name version url shasum; do
        path=${url#*/dist/}
        if [ "$path" = "$url" ] || [[ "$path" == *..* ]] || [[ ! "$path" =~ ^[A-Za-z0-9._/-]+\.zip$ ]]; then
            echo "abort: unexpected archive address for $name $version: $url" >&2
            exit 1
        fi
        mkdir -p "$WORK/output/dist/$(dirname "$path")"
        if ! fetch "$url" "$WORK/output/dist/$path"; then
            echo "abort: the released archive of $name $version cannot be fetched from $url" >&2
            exit 1
        fi
        if [ "$(sha1sum "$WORK/output/dist/$path" | cut -d' ' -f1)" != "$shasum" ]; then
            echo "abort: $url does not have the checksum its metadata states ($name $version)" >&2
            exit 1
        fi
    done < "$released"
    echo "released archives kept: $(wc -l < "$released")"
fi

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

# No released archive may change or disappear: the same file name and the same
# checksum as published, for every version the published repository offers.
while IFS=$'\t' read -r name version url shasum; do
    built=''
    if [ -f "$WORK/output/p2/$name.json" ]; then
        built=$(jq -r --arg name "$name" --arg version "$version" '.packages[$name][]?
            | select(.version == $version) | "\(.dist.url | split("/") | last) \(.dist.shasum)"' \
            "$WORK/output/p2/$name.json")
    fi
    if [ "$built" != "${url##*/} $shasum" ]; then
        echo "abort: the released archive of $name $version changed" >&2
        echo "       published: ${url##*/} $shasum" >&2
        echo "       built:     ${built:-nothing}" >&2
        exit 1
    fi
done < "$released"

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
