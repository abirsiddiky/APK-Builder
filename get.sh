#!/bin/bash
# ==============================================================================
# APK BUILDER - Quick Installer Bootstrap
# Usage:
#   curl -sSL https://raw.githubusercontent.com/abirsiddiky/APK-Builder/main/get.sh | sudo bash
#   curl -sSL https://raw.githubusercontent.com/abirsiddiky/APK-Builder/main/get.sh | sudo bash -s -- --flutter --domain yourdomain.com
# ==============================================================================

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# Ensure running as root
if [[ $(id -u) -ne 0 ]]; then
  echo -e "\033[0;31m[Error] This script must be run as root (use sudo).\033[0m" >&2
  exit 1
fi

echo "==> [Bootstrap] Installing required tools (git, curl)..."
apt-get update -qq </dev/null
apt-get install -y -qq -o Dpkg::Options::="--force-confold" git curl </dev/null

TMP_DIR="/tmp/apkbuilder-install"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "==> [Bootstrap] Cloning APK Builder repository..."
git clone --depth 1 https://github.com/abirsiddiky/APK-Builder.git "$TMP_DIR" </dev/null

chmod +x "$TMP_DIR/install.sh" "$TMP_DIR/uninstall.sh"

echo "==> [Bootstrap] Launching APK Builder installer..."
"$TMP_DIR/install.sh" "$@" </dev/null
