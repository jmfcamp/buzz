#!/bin/bash
# usage: deploy-web.sh <dist-web dir>
set -euo pipefail
cd "$1"
B=s3://hulabuzz-huladesk-web
# 1) hashed assets first and WITHOUT --delete: open tabs/PWAs on the previous build still lazy-load their old chunks.
aws s3 sync assets $B/assets --profile gogo --only-show-errors
# 2) everything else with --delete (assets/ excluded so old chunks survive); index.html etc. re-uploaded no-cache below.
aws s3 sync . $B --delete --exclude 'assets/*' --profile gogo --only-show-errors
# 3) prune old chunks: delete assets/ objects older than KEEP_DAYS (default 7) that the current build doesn't use.
KEEP_DAYS=${KEEP_DAYS:-7}
cutoff=$(date -u -v-${KEEP_DAYS}d +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "-${KEEP_DAYS} days" +%Y-%m-%dT%H:%M:%S)
ls assets > /tmp/deploy-web-current-assets.txt
aws s3api list-objects-v2 --bucket hulabuzz-huladesk-web --prefix assets/ --profile gogo \
  --query "Contents[?LastModified<'${cutoff}'].Key" --output text | tr '\t' '\n' | grep -v '^None$' | grep . \
  | while read -r key; do grep -qxF "${key#assets/}" /tmp/deploy-web-current-assets.txt || echo "$key"; done > /tmp/deploy-web-prune.txt || true
n=$(wc -l < /tmp/deploy-web-prune.txt | tr -d ' ')
echo "pruning $n asset(s) older than ${KEEP_DAYS}d"
while read -r key; do aws s3 rm "$B/$key" --profile gogo --only-show-errors; done < /tmp/deploy-web-prune.txt
for f in index.html manifest.webmanifest sw.js; do
  ct=text/html; [ $f = sw.js ] && ct=application/javascript; [ $f = manifest.webmanifest ] && ct=application/manifest+json
  aws s3 cp $f s3://hulabuzz-huladesk-web/$f --profile gogo --cache-control 'no-cache, no-store, must-revalidate' --content-type $ct --only-show-errors
done
aws s3 cp version.json s3://hulabuzz-huladesk-web/version.json --profile gogo --cache-control no-cache --content-type application/json --only-show-errors
id=$(aws cloudfront create-invalidation --distribution-id E2JA1FI113GGV6 --paths '/*' --profile gogo --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed --distribution-id E2JA1FI113GGV6 --id $id --profile gogo
echo "invalidated $id"
live=$(curl -s "https://hulabuzz.huladesk.com/version.json?t=$RANDOM"); echo "live: $live"
[ "$live" = "$(cat version.json)" ] && echo VERIFIED || { echo MISMATCH; exit 1; }
curl -sI https://hulabuzz.huladesk.com/sw.js | grep -i '^cache-control'
