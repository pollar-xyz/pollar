#!/usr/bin/env bash
# Tags the current commit as a release candidate and pushes the tag, which starts
# .github/workflows/release-rc.yml (publish to npm on `next`) and e2e-rc.yml.
#
#   npm run release:rc -- 0.12.0-rc.5
set -euo pipefail

VERSION="${1:-}"
VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$ ]] || { echo "usage: npm run release:rc -- X.Y.Z-rc.N" >&2; exit 1; }
TAG="v$VERSION"

# The same check the workflow runs, so a wrong line fails here and not after the push.
base="$(node -p 'require("./packages/core/package.json").version.split("-")[0]')"
[ "${VERSION%-rc.*}" = "$base" ] || { echo "$TAG does not match the code on this commit ($base)" >&2; exit 1; }

[ -z "$(git status --porcelain)" ] || { echo "the working tree has uncommitted changes" >&2; exit 1; }

git fetch origin --quiet --tags
# The tag publishes whatever commit it points at, so that commit must already be on a remote branch.
[ -n "$(git branch -r --contains HEAD)" ] || { echo "HEAD is not on any remote branch; push it first" >&2; exit 1; }
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || git ls-remote --exit-code --tags origin "$TAG" >/dev/null; then
  echo "$TAG already exists" >&2
  exit 1
fi

git tag -a "$TAG" -m "$TAG"
git push origin "refs/tags/$TAG"
echo "pushed $TAG: https://github.com/pollar-xyz/pollar/actions/workflows/release-rc.yml"
