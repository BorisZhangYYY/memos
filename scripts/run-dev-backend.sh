#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(dirname "$script_dir")
cd "$repo_root"

version=${MEMOS_VERSION:-$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//')}
commit=${MEMOS_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || printf 'unknown')}

if [ -z "$version" ]; then
  printf '%s\n' "Cannot determine a stable Memos version. Set MEMOS_VERSION and retry." >&2
  exit 1
fi

exec go run \
  -ldflags="-X github.com/usememos/memos/internal/version.Version=$version -X github.com/usememos/memos/internal/version.Commit=$commit" \
  ./cmd/memos "$@"
