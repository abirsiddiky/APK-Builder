#!/bin/bash
# ==============================================================================
# APK BUILDER - Native One-Time Installer (Ubuntu / Debian)
# Single binary, no Docker, systemd service running as user 'builder'
# ==============================================================================

# Ensure script is executed under bash even if invoked via `sh ./install.sh`
if [ -z "${BASH_VERSION:-}" ]; then
  exec /bin/bash "$0" "$@"
fi

set -euo pipefail

# Ensure fully non-interactive apt and package manager execution
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export APT_KEY_DONT_WARN_ON_DANGEROUS_USAGE=1

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
RESET_TOKEN=false
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
    --reset-token)
      RESET_TOKEN=true
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
      echo "  --reset-token            Force generate a new admin token even if one already exists"
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
apt-get update -qq </dev/null

# Select best available OpenJDK package (Debian 13+ uses openjdk-21-jdk / default-jdk; older uses openjdk-17-jdk)
JAVA_PKG="openjdk-17-jdk"
if ! apt-cache show openjdk-17-jdk >/dev/null 2>&1; then
  if apt-cache show openjdk-21-jdk >/dev/null 2>&1; then
    JAVA_PKG="openjdk-21-jdk"
  else
    JAVA_PKG="default-jdk"
  fi
fi

apt-get install -y -qq -o Dpkg::Options::="--force-confold" \
  "$JAVA_PKG" \
  git \
  unzip \
  curl \
  zip \
  tar \
  jq \
  wget \
  xz-utils \
  debian-keyring \
  debian-archive-keyring \
  apt-transport-https </dev/null

# Resolve JAVA_HOME dynamically
JAVA_BIN=$(command -v java 2>/dev/null || true)
if [[ -n "$JAVA_BIN" ]]; then
  CANONICAL_JAVA=$(readlink -f "$JAVA_BIN" 2>/dev/null || true)
  JAVA_HOME=$(dirname "$(dirname "$CANONICAL_JAVA")")
else
  JAVA_HOME="/usr/lib/jvm/default-java"
fi

if [[ -d "$JAVA_HOME" && ! -d "/usr/lib/jvm/default-java" ]]; then
  ln -sf "$JAVA_HOME" /usr/lib/jvm/default-java
fi

export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

# Install Caddy web server
echo -e "${BLUE}[2/8] Installing Caddy reverse proxy...${NC}"
if ! command -v caddy &>/dev/null; then
  mkdir -p /usr/share/keyrings /etc/apt/sources.list.d
  rm -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  if curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list 2>/dev/null || true
    apt-get update -qq </dev/null || true
  fi
  apt-get install -y -qq -o Dpkg::Options::="--force-confold" caddy </dev/null
fi

# Create unprivileged system user 'builder'
echo -e "${BLUE}[3/8] Creating service user 'builder' and data directories...${NC}"
if ! id -u builder &>/dev/null; then
  useradd -r -s /bin/bash -d "$DATA_DIR" -m -c "APK Builder Service User" builder
fi

mkdir -p "$DATA_DIR" "$DATA_DIR/keystores" "$DATA_DIR/builds" "$INSTALL_DIR"
chown -R builder:builder "$DATA_DIR"
chmod 700 "$DATA_DIR"

# Configure /etc/apkbuilder and Admin Access Token
mkdir -p /etc/apkbuilder
chmod 755 /etc/apkbuilder

ENV_FILE="/etc/apkbuilder/env"
HASH_FILE="$DATA_DIR/admin.token.hash"
TOKEN=""
IS_NEW_TOKEN=false

if [[ -f "$HASH_FILE" || -f "$ENV_FILE" ]]; then
  if [[ "$RESET_TOKEN" == true ]]; then
    echo -e "${YELLOW}[Auth] --reset-token passed: Generating new admin token...${NC}"
    if [[ -n "$ADMIN_TOKEN" ]]; then
      TOKEN="$ADMIN_TOKEN"
    else
      TOKEN=$(openssl rand -hex 32)
    fi
    IS_NEW_TOKEN=true
    rm -f "$HASH_FILE"
  elif [[ -n "$ADMIN_TOKEN" ]]; then
    echo -e "${YELLOW}[Auth] Custom --admin-token provided: Overwriting admin token...${NC}"
    TOKEN="$ADMIN_TOKEN"
    IS_NEW_TOKEN=true
    rm -f "$HASH_FILE"
  else
    # Re-install: keep existing token
    if [[ -f "$ENV_FILE" ]]; then
      EXISTING_TOKEN=$(grep -E '^APKBUILDER_ADMIN_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
    fi

    if [[ -n "${EXISTING_TOKEN:-}" ]]; then
      TOKEN="$EXISTING_TOKEN"
      echo -e "${GREEN}[Auth] Existing token found in /etc/apkbuilder/env. Existing token kept.${NC}"
      echo -e "${BLUE}       (Pass --reset-token to generate a new one)${NC}"
    else
      echo -e "${YELLOW}[Auth] Existing token hash found at $HASH_FILE. Existing token kept.${NC}"
      echo -e "${BLUE}       (Pass --reset-token to generate a new one)${NC}"
    fi
  fi
else
  # First-time installation
  echo -e "${BLUE}[Auth] Generating new admin access token...${NC}"
  if [[ -n "$ADMIN_TOKEN" ]]; then
    TOKEN="$ADMIN_TOKEN"
  else
    TOKEN=$(openssl rand -hex 32)
  fi
  IS_NEW_TOKEN=true
fi

# Write /etc/apkbuilder/env (chmod 600, owner root) if new token or file missing
if [[ "$IS_NEW_TOKEN" == true || ! -f "$ENV_FILE" ]]; then
  cat <<EOF > "$ENV_FILE"
APKBUILDER_ADMIN_TOKEN=$TOKEN
EOF
  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
fi

# Install Android SDK Command-Line Tools
echo -e "${BLUE}[4/8] Installing Android SDK to ${ANDROID_SDK_ROOT}...${NC}"
mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"

CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
TMP_CMDLINE="/tmp/cmdline-tools.zip"

if [[ ! -d "$ANDROID_SDK_ROOT/cmdline-tools/latest" ]]; then
  echo "Downloading Android Command-line Tools..."
  curl -sSL -o "$TMP_CMDLINE" "$CMDLINE_TOOLS_URL" </dev/null
  rm -rf /tmp/cmdline_extract
  unzip -q -o "$TMP_CMDLINE" -d "/tmp/cmdline_extract" </dev/null
  mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools/latest"
  cp -rf /tmp/cmdline_extract/cmdline-tools/* "$ANDROID_SDK_ROOT/cmdline-tools/latest/"
  rm -rf /tmp/cmdline_extract "$TMP_CMDLINE"
fi

export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

# Accept SDK licenses automatically
echo "Accepting Android SDK licenses..."
yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true

# Install essential SDK components (platform-tools, build-tools 34, android-34)
echo "Installing Android platform-tools, build-tools;34.0.0, and platforms;android-34..."
"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" \
  "build-tools;34.0.0" \
  "platforms;android-34" >/dev/null 2>&1 </dev/null || true

chown -R builder:builder "$ANDROID_SDK_ROOT"
chmod -R 755 "$ANDROID_SDK_ROOT"

# Install Gradle
echo -e "${BLUE}[4b/8] Installing Gradle 8.12 build tool to /opt/gradle...${NC}"
if [[ ! -d "/opt/gradle" ]]; then
  echo "Downloading Gradle 8.12..."
  GRADLE_URL="https://services.gradle.org/distributions/gradle-8.12-bin.zip"
  TMP_GRADLE="/tmp/gradle-8.12.zip"
  curl -sSL -o "$TMP_GRADLE" "$GRADLE_URL" </dev/null
  unzip -q -o "$TMP_GRADLE" -d /opt </dev/null
  rm -rf /opt/gradle
  mv -f /opt/gradle-8.12 /opt/gradle
  rm -f "$TMP_GRADLE"
  ln -sf /opt/gradle/bin/gradle /usr/local/bin/gradle
fi

# Optional: Install Flutter
if [[ "$INSTALL_FLUTTER" == true ]]; then
  echo -e "${BLUE}[5/8] Installing Flutter SDK to ${FLUTTER_ROOT}...${NC}"
  if [[ ! -d "$FLUTTER_ROOT" ]]; then
    FLUTTER_URL="https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.47.9-stable.tar.xz"
    curl -sSL "$FLUTTER_URL" </dev/null | tar -xJ -C /opt </dev/null
    echo "3.47.9" > "$FLUTTER_ROOT/.installed_version"
    chown -R builder:builder "$FLUTTER_ROOT"
    git config --system --add safe.directory "$FLUTTER_ROOT" </dev/null || true
    su - builder -c "export ANDROID_HOME=$ANDROID_SDK_ROOT; export PATH=$FLUTTER_ROOT/bin:$PATH; flutter config --no-analytics; flutter precache --android" >/dev/null 2>&1 </dev/null || true
  fi
else
  echo -e "${BLUE}[5/8] Skipping Flutter SDK (pass --flutter to install)...${NC}"
fi

# Install Binary
echo -e "${BLUE}[6/8] Installing APK Builder binary to ${INSTALL_DIR}...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

USE_EXISTING_BINARY=false
if [[ -f "$SCRIPT_DIR/apkbuilder" ]]; then
  # Check if it is an ELF executable
  if head -c 4 "$SCRIPT_DIR/apkbuilder" 2>/dev/null | grep -q 'ELF'; then
    USE_EXISTING_BINARY=true
  fi
fi

if [[ "$USE_EXISTING_BINARY" == true ]]; then
  echo "Using pre-compiled native Linux binary..."
  cp -f "$SCRIPT_DIR/apkbuilder" "$INSTALL_DIR/apkbuilder"
else
  echo "Pre-compiled Linux binary not detected. Building from source..."
  GO_BIN="go"
  CLEANUP_GO_BOOTSTRAP=false

  # Check if Go compiler is installed and version >= 1.22
  GO_VALID=false
  if command -v go &>/dev/null; then
    GO_VER=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//' | cut -d. -f1,2)
    GO_MAJOR=$(echo "$GO_VER" | cut -d. -f1)
    GO_MINOR=$(echo "$GO_VER" | cut -d. -f2)
    if [[ "$GO_MAJOR" -ge 1 && "$GO_MINOR" -ge 22 ]]; then
      GO_VALID=true
    fi
  fi

  if [[ "$GO_VALID" != true ]]; then
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64) GO_ARCH="amd64" ;;
      aarch64|arm64) GO_ARCH="arm64" ;;
      *) GO_ARCH="amd64" ;;
    esac
    echo "Downloading standalone Go toolchain (1.23.6 for $GO_ARCH)..."
    BOOTSTRAP_DIR="/tmp/go-bootstrap"
    rm -rf "$BOOTSTRAP_DIR"
    mkdir -p "$BOOTSTRAP_DIR"
    curl -sSL "https://go.dev/dl/go1.23.6.linux-${GO_ARCH}.tar.gz" | tar -xz -C "$BOOTSTRAP_DIR"
    GO_BIN="$BOOTSTRAP_DIR/go/bin/go"
    CLEANUP_GO_BOOTSTRAP=true
  fi

  echo "Compiling APK Builder single binary..."
  (cd "$SCRIPT_DIR" && "$GO_BIN" build -o "$INSTALL_DIR/apkbuilder" ./cmd/server)

  if [[ "$CLEANUP_GO_BOOTSTRAP" == true ]]; then
    rm -rf /tmp/go-bootstrap
  fi
fi

if [[ ! -f "$INSTALL_DIR/apkbuilder" ]]; then
  echo -e "${RED}[Error] Failed to install or build apkbuilder binary.${NC}"
  exit 1
fi

chmod 755 "$INSTALL_DIR/apkbuilder"
chown root:root "$INSTALL_DIR/apkbuilder"

# Install Systemd Service
echo -e "${BLUE}[7/8] Configuring and starting systemd service...${NC}"
cp -f "$SCRIPT_DIR/apkbuilder.service" /etc/systemd/system/apkbuilder.service

# If custom port passed, adjust in service unit
if [[ "$PORT" != "8080" ]]; then
  sed -i "s/PORT=8080/PORT=$PORT/g" /etc/systemd/system/apkbuilder.service
fi

systemctl daemon-reload </dev/null
systemctl enable apkbuilder.service </dev/null
systemctl restart apkbuilder.service </dev/null

# Optional: Warm Gradle Cache
if [[ "$WARM_GRADLE" == true ]]; then
  echo -e "${BLUE}[Cache] Pre-warming Gradle cache (building tiny dummy template)...${NC}"
  WARM_DIR="/tmp/gradle-warmup"
  rm -rf "$WARM_DIR"
  mkdir -p "$WARM_DIR"
  chown -R builder:builder "$WARM_DIR"
  su - builder -c "mkdir -p $WARM_DIR && cd $WARM_DIR && gradle init --type basic --dsl kotlin </dev/null && ./gradlew --version" >/dev/null 2>&1 </dev/null || true
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

systemctl restart caddy </dev/null

# Verify service is running
sleep 1
if ! systemctl is-active --quiet apkbuilder.service; then
  echo -e "${YELLOW}[Warning] apkbuilder service did not enter active state immediately. Check logs:${NC}"
  echo -e "  sudo journalctl -u apkbuilder.service -n 20 --no-pager"
fi

echo -e "\n${GREEN}${BOLD}================================================================================${NC}"
echo -e "${GREEN}${BOLD}                     APK BUILDER INSTALLED SUCCESSFULLY!                        ${NC}"
echo -e "${GREEN}${BOLD}================================================================================${NC}"
echo ""
echo -e "  ${BOLD}Web Dashboard URL:${NC}    ${CYAN}${ACCESS_URL}${NC}"
echo ""
if [[ -n "$TOKEN" ]]; then
echo -e "  ${YELLOW}${BOLD}+----------------------------------------------------------------------------+${NC}"
echo -e "  ${YELLOW}${BOLD}| ADMIN ACCESS TOKEN                                                         |${NC}"
echo -e "  ${YELLOW}${BOLD}+----------------------------------------------------------------------------+${NC}"
echo -e "  ${CYAN}${BOLD}  ${TOKEN}${NC}"
echo -e "  ${YELLOW}${BOLD}+----------------------------------------------------------------------------+${NC}"
echo -e "  ${RED}${BOLD}  [IMPORTANT] Save it now! You need this token to log in and build APKs.      ${NC}"
echo -e "  ${BLUE}  (Stored securely in /etc/apkbuilder/env - chmod 600, owner root)             ${NC}"
if [[ "$IS_NEW_TOKEN" == false ]]; then
echo -e "  ${GREEN}  Note: Existing token kept. Rerun with --reset-token to rotate.             ${NC}"
fi
echo -e "  ${YELLOW}${BOLD}+----------------------------------------------------------------------------+${NC}"
else
echo -e "  ${YELLOW}${BOLD}[NOTICE]${NC} Existing token kept. (Check /etc/apkbuilder/env)"
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

