#!/bin/sh
# Serve the offline fact sources (Wikipedia + Wiktionary ZIMs) on 127.0.0.1:8090 for
# services/offline-facts.js. kiwix-serve is Kiwix's official build (GPL-3.0), run as a
# separate local process. Every .zim in the sources folder is served; -z adds undated
# aliases (wikipedia_en_all_nopic) so a newer monthly file needs no config change.
#   KIWIX_DIR      folder with kiwix-serve(.exe)  (default ../local-tools/kiwix-tools)
#   OFFLINE_DIR    folder with the .zim files     (default ../offline-sources)
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/../.." && pwd)"
KIWIX_DIR="${KIWIX_DIR:-$APP/../local-tools/kiwix-tools}"
OFFLINE_DIR="${OFFLINE_DIR:-$APP/../offline-sources}"
PORT="${KIWIX_PORT:-8090}"
# Run from the sources folder with bare file names: a book name containing a folder
# ("offline-sources/wikipedia...") breaks kiwix-serve's /content/ routes.
cd "$OFFLINE_DIR" || exit 1
# Only files whose download finished and passed its checksum (download.sh logs "OK <file>").
set --
for f in *.zim; do grep -qx "OK $f" download.log 2>/dev/null && set -- "$@" "$f"; done
[ $# -gt 0 ] || { echo "no verified .zim files in $OFFLINE_DIR (run its download.sh)"; exit 1; }
exec "$KIWIX_DIR/kiwix-serve" --address=127.0.0.1 --port="$PORT" --threads=4 -z "$@"
