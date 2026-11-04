#!/bin/bash
set -e
apt update && apt install -y git
rm -rf /tmp/apk-builder
git clone --depth 1 https://github.com/abirsiddiky/apk-builder.git /tmp/apk-builder
cd /tmp/apk-builder
chmod +x install.sh uninstall.sh
./install.sh "$@"