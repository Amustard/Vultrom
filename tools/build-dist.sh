#!/bin/sh
# Rebuild dist/Vultrom-<version>.mcaddon, dist/Vultrom_BP-<version>.mcpack and
# dist/Vultrom_RP-<version>.mcpack. <version> is the BP manifest's header version
# (1.0.5 -> 0.1.5, matching the v0.1.x-bedrock release tags); the RP must match it.
# The .mcaddon holds the two pack folders directly (the canonical layout).
set -eu
cd "$(dirname "$0")/.."

header_version() {
	python3 -c 'import json, sys; print(".".join(map(str, json.load(open(sys.argv[1]))["header"]["version"])))' "$1"
}
BP_VERSION=$(header_version Vultrom_BP/manifest.json)
RP_VERSION=$(header_version Vultrom_RP/manifest.json)
if [ "$BP_VERSION" != "$RP_VERSION" ]; then
	echo "BP manifest is $BP_VERSION but RP manifest is $RP_VERSION; bump both." >&2
	exit 1
fi
case "$BP_VERSION" in
1.0.*) VERSION="0.1.${BP_VERSION#1.0.}" ;;
*)
	echo "Don't know the release name for pack version $BP_VERSION; update tools/build-dist.sh." >&2
	exit 1
	;;
esac

rm -f dist/*.mcpack dist/*.mcaddon
(cd Vultrom_BP && zip -qrX "../dist/Vultrom_BP-$VERSION.mcpack" . -x '*.DS_Store')
(cd Vultrom_RP && zip -qrX "../dist/Vultrom_RP-$VERSION.mcpack" . -x '*.DS_Store')
zip -qrX "dist/Vultrom-$VERSION.mcaddon" Vultrom_BP Vultrom_RP -x '*.DS_Store'
ls -l dist/*.mcpack dist/*.mcaddon
