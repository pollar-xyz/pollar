#!/usr/bin/env bash
# Tags the current commit as a release candidate and pushes the tag, which starts
# .github/workflows/release-rc.yml (publish to npm on `next`) and e2e-rc.yml.
#
#   npm run release:rc -- 0.12.0-rc.5
#   npm run release:rc -- 0.12.0-rc.5 --fast
#
# --fast creates no tag: it starts release-rc.yml by hand on the current branch with
# skip_tests, so it publishes without the unit and smoke tests and runs no e2e.
set -euo pipefail

VERSION=""
FAST=0
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1 ;;
    *) VERSION="$arg" ;;
  esac
done
VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$ ]] || { echo "usage: npm run release:rc -- X.Y.Z-rc.N [--fast]" >&2; exit 1; }
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

if [ "$FAST" = 1 ]; then
  command -v gh >/dev/null || { echo "--fast needs the GitHub CLI (gh)" >&2; exit 1; }
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  [ "$BRANCH" != HEAD ] || { echo "--fast needs a branch checked out, not a detached HEAD" >&2; exit 1; }
  # The workflow builds the branch as it is on origin, not this commit, so the two must match.
  [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH" 2>/dev/null)" ] || {
    echo "HEAD is not origin/$BRANCH; push it first" >&2
    exit 1
  }
  # Without a tag, npm is the only record that this version was taken.
  if npm view "@pollar/core@$VERSION" version --silent 2>/dev/null | grep -qx "$VERSION"; then
    echo "@pollar/core@$VERSION is already on npm" >&2
    exit 1
  fi
  gh workflow run release-rc.yml --ref "$BRANCH" -f version="$VERSION" -f skip_tests=true
  echo "started release-rc.yml for $VERSION on $BRANCH without tests: https://github.com/pollar-xyz/pollar/actions/workflows/release-rc.yml"
  exit 0
fi

git tag -a "$TAG" -m "$TAG"
git push origin "refs/tags/$TAG"
echo "pushed $TAG: https://github.com/pollar-xyz/pollar/actions/workflows/release-rc.yml"
