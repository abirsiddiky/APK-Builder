#!/usr/bin/env bash
# ==============================================================================
# APK BUILDER - Native One-Time Installer (Ubuntu / Debian)
# Single binary, no Docker, systemd service running as user 'builder'
# ==============================================================================

set -euo pipefail

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Default options
DOMAIN=""
INSTALL_FLUTTER=false
WARM_GRADLE=false
PORT="8080"
ADMIN_TOKEN=""
INSTALL_DIR="/opt/apkbuilder"
DATA_DIR="/var/lib/apkbuilder"
ANDROID_SDK_ROOT="/opt/android-sdk"
FLUTTER_ROOT="/opt/flutter"

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --flutter)
      INSTALL_FLUTTER=true
      shift
      ;;
    --warm-cache)
      WARM_GRADLE=true
      shift
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --admin-token)
      ADMIN_TOKEN="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: sudo ./install.sh [options]"
      echo ""
      echo "Options:"
      echo "  --domain <domain>        Configure Caddy with automatic HTTPS for this domain"
      echo "  --flutter                Install Flutter SDK in addition to Android SDK"
      echo "  --warm-cache             Pre-warm Gradle caches to speed up initial builds"
      echo "  --port <port>            Internal backend service port (default: 8080)"
      echo "  --admin-token <token>    Specify an admin token instead of generating a random one"
      echo "  -h, --help               Show this help message"
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

# Detect OS
if [[ ! -f /etc/os-release ]]; then
  echo -e "${RED}[Error] /etc/os-release not found. Unsupported Linux distribution.${NC}"
  exit 1
fi

. /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" && "$ID_LIKE" != *"debian"* && "$ID_LIKE" != *"ubuntu"* ]]; then
  echo -e "${YELLOW}[Warning] This script is tested on Ubuntu and Debian. Proceeding with caution...${NC}"
fi

echo -e "${CYAN}${BOLD}"
echo "================================================================================"
echo "                         APK BUILDER INSTALLATION                               "
echo "================================================================================"
echo -e "${NC}"

# Detect Public IP
SERVER_IP=$(curl -s4 https://api.ipify.org || curl -s4 https://icanhazip.com || hostname -I | awk '{print $1}')

echo -e "${BLUE}[1/8] Updating package lists and installing core dependencies...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  openjdk-17-jdk \
  git \
  unzip \
  curl \
  zip \
  tar \
  jq \
  wget \
  debian-keyring \
  debian-archive-keyring \
  apt-transport-https

# Install Caddy web server
echo -e "${BLUE}[2/8] Installing Caddy reverse proxy...${NC}"
if ! command -v caddy &>/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# Create unprivileged system user 'builder'
echo -e "${BLUE}[3/8] Creating service user 'builder' and data directories...${NC}"
if ! id -u builder &>/dev/null; then
  useradd -r -s /bin/bash -d "$DATA_DIR" -m -c "APK Builder Service User" builder
fi

mkdir -p "$DATA_DIR" "$DATA_DIR/keystores" "$DATA_DIR/builds" "$INSTALL_DIR"
chown -R builder:builder "$DATA_DIR"
chmod 700 "$DATA_DIR"

# Install Android SDK Command-Line Tools
echo -e "${BLUE}[4/8] Installing Android SDK to ${ANDROID_SDK_ROOT}...${NC}"
mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"

CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
TMP_CMDLINE="/tmp/cmdline-tools.zip"

if [[ ! -d "$ANDROID_SDK_ROOT/cmdline-tools/latest" ]]; then
  echo "Downloading Android Command-line Tools..."
  curl -sSL -o "$TMP_CMDLINE" "$CMDLINE_TOOLS_URL"
  unzip -q -o "$TMP_CMDLINE" -d "/tmp/cmdline_extract"
  mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools/latest"
  cp -r /tmp/cmdline_extract/cmdline-tools/* "$ANDROID_SDK_ROOT/cmdline-tools/latest/"
  rm -rf /tmp/cmdline_extract "$TMP_CMDLINE"
fi

export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export PATH="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

# Accept SDK licenses automatically
echo "Accepting Android SDK licenses..."
yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true

# Install essential SDK components (platform-tools, build-tools 34, android-34)
echo "Installing Android platform-tools, build-tools;34.0.0, and platforms;android-34..."
"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" \
  "build-tools;34.0.0" \
  "platforms;android-34" >/dev/null 2>&1

chown -R builder:builder "$ANDROID_SDK_ROOT"
chmod -R 755 "$ANDROID_SDK_ROOT"

# Optional: Install Flutter
if [[ "$INSTALL_FLUTTER" == true ]]; then
  echo -e "${BLUE}[5/8] Installing Flutter SDK to ${FLUTTER_ROOT}...${NC}"
  if [[ ! -d "$FLUTTER_ROOT" ]]; then
    FLUTTER_URL="https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.29.0-stable.tar.xz"
    curl -sSL "$FLUTTER_URL" | tar -xJ -C /opt
    chown -R builder:builder "$FLUTTER_ROOT"
    git config --system --add safe.directory "$FLUTTER_ROOT"
    su - builder -c "export ANDROID_HOME=$ANDROID_SDK_ROOT; export PATH=$FLUTTER_ROOT/bin:$PATH; flutter precache --android" >/dev/null 2>&1 || true
  fi
else
  echo -e "${BLUE}[5/8] Skipping Flutter SDK (pass --flutter to install)...${NC}"
fi

# Install Binary
echo -e "${BLUE}[6/8] Installing APK Builder binary to ${INSTALL_DIR}...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if binary already built locally
if [[ -f "$SCRIPT_DIR/apkbuilder" ]]; then
  cp "$SCRIPT_DIR/apkbuilder" "$INSTALL_DIR/apkbuilder"
elif [[ -f "$SCRIPT_DIR/apkbuilder.exe" ]]; then
  # On cross-dev, check if go is installed on host to build native binary
  if command -v go &>/dev/null; then
    echo "Compiling native Linux binary from source..."
    (cd "$SCRIPT_DIR" && go build -o "$INSTALL_DIR/apkbuilder" ./cmd/server)
  else
    echo -e "${RED}[Error] Native Linux binary not found. Please compile with 'go build -o apkbuilder ./cmd/server' first.${NC}"
    exit 1
  fi
else
  if command -v go &>/dev/null; then
    echo "Compiling native Linux binary from source..."
    (cd "$SCRIPT_DIR" && go build -o "$INSTALL_DIR/apkbuilder" ./cmd/server)
  else
    echo -e "${RED}[Error] Could not find or build apkbuilder binary.${NC}"
    exit 1
  fi
fi

chmod 755 "$INSTALL_DIR/apkbuilder"
chown root:root "$INSTALL_DIR/apkbuilder"

# Install Systemd Service
echo -e "${BLUE}[7/8] Configuring and starting systemd service...${NC}"
cp "$SCRIPT_DIR/apkbuilder.service" /etc/systemd/system/apkbuilder.service

# If custom port or admin token passed, adjust in service or environment
if [[ "$PORT" != "8080" ]]; then
  sed -i "s/PORT=8080/PORT=$PORT/g" /etc/systemd/system/apkbuilder.service
fi

if [[ -n "$ADMIN_TOKEN" ]]; then
  sed -i "/\[Service\]/a Environment=\"ADMIN_TOKEN=$ADMIN_TOKEN\"" /etc/systemd/system/apkbuilder.service
fi

systemctl daemon-reload
systemctl enable apkbuilder.service
systemctl restart apkbuilder.service

# Optional: Warm Gradle Cache
if [[ "$WARM_GRADLE" == true ]]; then
  echo -e "${BLUE}[Cache] Pre-warming Gradle cache (building tiny dummy template)...${NC}"
  WARM_DIR="/tmp/gradle-warmup"
  rm -rf "$WARM_DIR"
  mkdir -p "$WARM_DIR"
  chown -R builder:builder "$WARM_DIR"
  su - builder -c "mkdir -p $WARM_DIR && cd $WARM_DIR && gradle init --type basic --dsl kotlin </dev/null && ./gradlew --version" >/dev/null 2>&1 || true
  rm -rf "$WARM_DIR"
fi

# Configure Caddy Reverse Proxy
echo -e "${BLUE}[8/8] Configuring Caddy reverse proxy...${NC}"
if [[ -n "$DOMAIN" ]]; then
  cat <<EOF > /etc/caddy/Caddyfile
$DOMAIN {
    reverse_proxy 127.0.0.1:$PORT {
        flush_interval -1
    }
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }
}
EOF
  ACCESS_URL="https://$DOMAIN"
else
  cat <<EOF > /etc/caddy/Caddyfile
:80 {
    reverse_proxy 127.0.0.1:$PORT {
        flush_interval -1
    }
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }
}
EOF
  ACCESS_URL="http://$SERVER_IP"
fi

systemctl restart caddy

# Wait briefly for service startup and retrieve admin token
sleep 2
GENERATED_TOKEN=""
if [[ -n "$ADMIN_TOKEN" ]]; then
  GENERATED_TOKEN="$ADMIN_TOKEN"
else
  # Extract token from journalctl
  GENERATED_TOKEN=$(journalctl -u apkbuilder.service -n 50 --no-pager | grep -A 2 "Your admin access token is:" | tail -n 1 | xargs || true)
  if [[ -z "$GENERATED_TOKEN" ]]; then
    GENERATED_TOKEN=$(journalctl -u apkbuilder.service -n 50 --no-pager | grep -E "^\s*[a-f0-9]{64}\s*$" | head -n 1 | xargs || true)
  fi
fi

echo -e "\n${GREEN}${BOLD}================================================================================${NC}"
echo -e "${GREEN}${BOLD}                     APK BUILDER INSTALLED SUCCESSFULLY!                        ${NC}"
echo -e "${GREEN}${BOLD}================================================================================${NC}"
echo ""
echo -e "  ${BOLD}Web Dashboard URL:${NC}    ${CYAN}${ACCESS_URL}${NC}"
if [[ -n "$GENERATED_TOKEN" ]]; then
echo -e "  ${BOLD}Admin Access Token:${NC}   ${YELLOW}${GENERATED_TOKEN}${NC}"
else
echo -e "  ${BOLD}Admin Access Token:${NC}   (Check: journalctl -u apkbuilder.service -n 20)"
fi
echo ""
if [[ -z "$DOMAIN" ]]; then
echo -e "  ${YELLOW}${BOLD}[NOTICE]${NC} Running over plain HTTP on port 80. To secure with free HTTPS,"
echo -e "           rerun installer with: sudo ./install.sh --domain yourdomain.com"
echo ""
fi
echo -e "  ${BOLD}Service Status:${NC}       sudo systemctl status apkbuilder"
echo -e "  ${BOLD}Live Server Logs:${NC}     sudo journalctl -u apkbuilder -f"
echo -e "  ${BOLD}To Completely Remove:${NC} sudo ./uninstall.sh"
echo ""
echo -e "  ${RED}${BOLD}[REMINDER]${NC} Delete this VPS from your cloud provider panel when done"
echo -e "             to stop ongoing hourly billing!"
echo -e "${GREEN}${BOLD}================================================================================${NC}\n"

