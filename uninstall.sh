#!/usr/bin/env bash
# ==============================================================================
# APK BUILDER - Uninstallation & VPS Cleanup Script
# Run as root (sudo) to completely remove APK Builder and securely wipe data
# ==============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

AUTO_CONFIRM=false
REMOVE_SDK=false
REMOVE_DEPS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -y|--yes)
      AUTO_CONFIRM=true
      shift
      ;;
    --remove-sdk)
      REMOVE_SDK=true
      shift
      ;;
    --remove-deps)
      REMOVE_DEPS=true
      shift
      ;;
    --purge-all)
      REMOVE_SDK=true
      REMOVE_DEPS=true
      shift
      ;;
    -h|--help)
      echo "Usage: sudo ./uninstall.sh [options]"
      echo ""
      echo "Options:"
      echo "  -y, --yes          Non-interactive mode (skip confirmation prompt)"
      echo "  --remove-sdk       Also delete Android SDK (/opt/android-sdk) and Flutter (/opt/flutter)"
      echo "  --remove-deps      Also uninstall OpenJDK 17 and Caddy packages"
      echo "  --purge-all        Purge EVERYTHING: app, user, keystores, SDK, and dependencies"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Ensure running as root
if [[ $(id -u) -ne 0 ]]; then
  echo -e "${RED}[Error] This script must be run as root (use sudo).${NC}"
  exit 1
fi

echo -e "${CYAN}${BOLD}"
echo "================================================================================"
echo "                         APK BUILDER UNINSTALLER                                "
echo "================================================================================"
echo -e "${NC}"

if [[ "$AUTO_CONFIRM" != true ]]; then
  echo -e "${YELLOW}This will completely remove the APK Builder service, user accounts, and"
  echo -e "securely wipe all stored keystores, tokens, and build artifacts.${NC}"
  echo ""
  read -r -p "Are you sure you want to proceed with uninstallation? [y/N]: " confirm
  if [[ "$confirm" != [yY] && "$confirm" != [yY][eE][sS] ]]; then
    echo -e "${BLUE}Uninstallation cancelled.${NC}"
    exit 0
  fi
fi

REMOVED_SUMMARY=()

# 1. Stop and remove systemd service
echo -e "\n${BLUE}[1/5] Stopping and removing systemd service...${NC}"
if systemctl is-active --quiet apkbuilder.service 2>/dev/null; then
  systemctl stop apkbuilder.service
  REMOVED_SUMMARY+=("Stopped apkbuilder systemd service")
fi

if systemctl is-enabled --quiet apkbuilder.service 2>/dev/null; then
  systemctl disable apkbuilder.service
fi

if [[ -f /etc/systemd/system/apkbuilder.service ]]; then
  rm -f /etc/systemd/system/apkbuilder.service
  systemctl daemon-reload
  REMOVED_SUMMARY+=("Removed /etc/systemd/system/apkbuilder.service")
fi

# 2. Securely shred leftover tokens and keystores
echo -e "${BLUE}[2/5] Securely wiping leftover keystores and admin tokens...${NC}"
wipe_file() {
  local target="$1"
  if [[ -f "$target" ]]; then
    if command -v shred &>/dev/null; then
      shred -u -z -n 3 "$target" 2>/dev/null || rm -f "$target"
    else
      # Fallback zero-overwrite
      dd if=/dev/urandom of="$target" bs=4k count=1 conv=notrunc 2>/dev/null || true
      rm -f "$target"
    fi
  fi
}

# Find and shred all sensitive files in /var/lib/apkbuilder
if [[ -d "/var/lib/apkbuilder" ]]; then
  find /var/lib/apkbuilder -type f \( -name "*.keystore" -o -name "*.jks" -o -name "*.hash" -o -name "info.txt" \) | while read -r f; do
    wipe_file "$f"
  done
  REMOVED_SUMMARY+=("Securely shredded sensitive keystores and token hashes")
fi

# 3. Remove application and data directories
echo -e "${BLUE}[3/5] Removing application files and directories...${NC}"
if [[ -d "/opt/apkbuilder" ]]; then
  rm -rf /opt/apkbuilder
  REMOVED_SUMMARY+=("Removed /opt/apkbuilder")
fi

if [[ -d "/var/lib/apkbuilder" ]]; then
  rm -rf /var/lib/apkbuilder
  REMOVED_SUMMARY+=("Removed /var/lib/apkbuilder")
fi

# Clean up temp build caches
rm -rf /tmp/cmdline-tools* /tmp/gradle* /tmp/cmdline_extract 2>/dev/null || true

# 4. Remove 'builder' system user
echo -e "${BLUE}[4/5] Removing service user 'builder'...${NC}"
if id -u builder &>/dev/null; then
  pkill -u builder 2>/dev/null || true
  sleep 1
  userdel -r -f builder 2>/dev/null || true
  groupdel builder 2>/dev/null || true
  REMOVED_SUMMARY+=("Deleted system user and group 'builder'")
fi

# Revert or clean Caddy config
if [[ -f /etc/caddy/Caddyfile ]]; then
  echo "Resetting Caddy configuration..."
  cat <<'EOF' > /etc/caddy/Caddyfile
:80 {
    respond "No active services configured." 200
}
EOF
  systemctl reload caddy 2>/dev/null || true
  REMOVED_SUMMARY+=("Reset Caddy proxy configuration")
fi

# 5. Optional SDK and Dependency removal
echo -e "${BLUE}[5/5] Processing optional removal flags...${NC}"
if [[ "$REMOVE_SDK" == true ]]; then
  echo "Removing Android SDK, Flutter, and Gradle..."
  rm -rf /opt/android-sdk /opt/flutter /opt/gradle /usr/local/bin/gradle
  REMOVED_SUMMARY+=("Removed /opt/android-sdk, /opt/flutter, and /opt/gradle")
fi

if [[ "$REMOVE_DEPS" == true ]]; then
  echo "Uninstalling OpenJDK 17 and Caddy..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get purge -y -qq openjdk-17-jdk caddy 2>/dev/null || true
  apt-get autoremove -y -qq 2>/dev/null || true
  REMOVED_SUMMARY+=("Uninstalled openjdk-17-jdk and caddy packages")
fi

# Print final removal summary
echo -e "\n${GREEN}${BOLD}================================================================================${NC}"
echo -e "${GREEN}${BOLD}                   APK BUILDER UNINSTALLED SUCCESSFULLY                         ${NC}"
echo -e "${GREEN}${BOLD}================================================================================${NC}"
echo ""
echo -e "${BOLD}Removed components:${NC}"
for item in "${REMOVED_SUMMARY[@]}"; do
  echo -e "  ${GREEN}✓${NC} $item"
done
echo ""
if [[ "$REMOVE_SDK" == false ]]; then
  echo -e "${YELLOW}Note:${NC} Android SDK (/opt/android-sdk) was preserved."
  echo -e "      To remove it, re-run with: sudo ./uninstall.sh -y --remove-sdk"
  echo ""
fi
echo -e "${RED}${BOLD}================================================================================${NC}"
echo -e "${RED}${BOLD}                               FINAL REMINDER                                   ${NC}"
echo -e "${RED}${BOLD}  Delete this VPS from your cloud provider panel (DigitalOcean, Hetzner, AWS,   ${NC}"
echo -e "${RED}${BOLD}  Vultr, Linode) now to stop hourly billing!                                    ${NC}"
echo -e "${RED}${BOLD}================================================================================${NC}\n"

