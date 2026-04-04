#!/usr/bin/env bash

set -euo pipefail

if [ -f .env ]; then
  source .env
fi

: "${PASSWORD:?PASSWORD not set}"

deno task fetch

if [ ! -n "$(git status --porcelain feeds/)" ]; then
  echo "no changes"
  exit 0
fi

deno task build

tar --zstd -cvf site.tar.zst -C dist/ .

curl http://sr.puida.xyz \
  -X PUT \
  -H "Authorization: Pages $PASSWORD" \
  -H 'Content-Type: application/x-tar+zstd' \
  --data-binary @site.tar.zst
