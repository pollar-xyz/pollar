#!/usr/bin/env bash
# Tags the current commit with the stable version in packages/core/package.json and
# pushes the tag. It publishes nothing: stable packages go out by hand with the
# `*:publish` scripts first, and no workflow runs on a tag without `-rc`.
#
#   npm run release:tag
set -euo pipefail

VERSION="$(node -p 'require("./packages/core/package.json").version')"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "$VERSION is not a stable version; use npm run release:rc" >&2; exit 1; }
TAG="v$VERSION"

[ -z "$(git status --porcelain)" ] || { echo "the working tree has uncommitted changes" >&2; exit 1; }

# The tag marks what is on npm, so the version has to be published already.
npm view "@pollar/core@$VERSION" version >/dev/null 2>&1 || { echo "@pollar/core@$VERSION is not on npm; publish it first" >&2; exit 1; }

git fetch origin --quiet --tags
[ -n "$(git branch -r --contains HEAD)" ] || { echo "HEAD is not on any remote branch; push it first" >&2; exit 1; }
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || git ls-remote --exit-code --tags origin "$TAG" >/dev/null; then
  echo "$TAG already exists" >&2
  exit 1
fi

git tag -a "$TAG" -m "$TAG"
git push origin "refs/tags/$TAG"
echo "pushed $TAG"
