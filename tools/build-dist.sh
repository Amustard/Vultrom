#!/bin/sh
# Rebuild dist/Vultrom_BP.mcpack, dist/Vultrom_RP.mcpack and dist/Vultrom.mcaddon.
# The .mcaddon holds the two pack folders directly (the canonical layout).
set -eu
cd "$(dirname "$0")/.."

rm -f dist/Vultrom_BP.mcpack dist/Vultrom_RP.mcpack dist/Vultrom.mcaddon
(cd Vultrom_BP && zip -qrX ../dist/Vultrom_BP.mcpack . -x '*.DS_Store')
(cd Vultrom_RP && zip -qrX ../dist/Vultrom_RP.mcpack . -x '*.DS_Store')
zip -qrX dist/Vultrom.mcaddon Vultrom_BP Vultrom_RP -x '*.DS_Store'
ls -l dist/*.mcpack dist/*.mcaddon
