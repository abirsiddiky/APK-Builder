# APK Builder

> **Self-hosted, disposable Android build server for Linux VPS (Ubuntu/Debian, NO Docker).**  
> Paste a Git repository URL, choose Debug or Signed Release, watch the live build log in an embedded terminal, and download your Android APK.

---

## Features

- **No Docker Required:** Native one-time installation directly on bare-metal or disposable Linux cloud VPS (Hetzner, DigitalOcean, Vultr, Linode, AWS EC2, etc.).
- **Wide OS Support:** Fully tested on Ubuntu (20.04, 22.04, 24.04, 26.04 LTS) and Debian (11 Bullseye, 12 Bookworm, 13 Trixie).
- **Single Static Binary:** Go backend embedding the compiled Angular 22 SPA frontend with `go:embed`.
- **Security by Design:**
  - Runs as an unprivileged system user `builder` (not `root`) under systemd.
  - Cryptographically secure 64-char admin token generated during install, stored in `/etc/apkbuilder/env` (`chmod 600`), and securely hashed.
  - In-memory rate limiting protecting against brute-force login attempts.
  - Real-time secret, token, and password masking across all logs and SSE streams.
  - Temporary files and keystores stored with `chmod 600` inside a `chmod 700` directory.
- **Smart Project Auto-Detection:**
  - **Android Gradle Projects:** Supports Groovy and Kotlin DSL (`build.gradle`, `build.gradle.kts`, `settings.gradle.kts`), AGP 8.x / 9.x, and Gradle 9.3+. If a repository lacks the Gradle wrapper executable or jar, APK Builder automatically injects an embedded wrapper while preserving your custom distribution configuration.
  - **Flutter Projects:** Supports modern Flutter apps (`pubspec.yaml`). Ships with Flutter **3.47.9** stable and **Dart SDK 3.13.7** (satisfying modern dependencies such as `environment: sdk: ^3.13.5+`). Automatically detects outdated cached SDKs and auto-upgrades them on demand.
- **Signed Release Pipeline:**
  - Built-in RSA 2048 keystore generator via `keytool -genkeypair`.
  - Supports uploading existing `.jks` or `.keystore` files.
  - Downloads `.keystore` + `info.txt` credentials file with prominent backup warning.
  - Automated `zipalign` and `apksigner` release signing pipeline.
- **Terminal-Style Build Log:**
  - Embedded `@xterm/xterm` + `FitAddon` terminal with authentic dark theme.
  - Real-time Server-Sent Events (SSE) streaming with ANSI color rendering.
  - Intelligent auto-scroll with floating **Jump to bottom** button when scrolling up.
  - Toolbar with **Copy Log**, **Clear**, **Download Log (.txt)**, and **Fullscreen toggle**.
  - In-memory 5,000-line circular buffer restoring log history on page refresh.
- **Cost Awareness for Disposable Cloud Servers:**
  - Live server uptime cost hint in the navigation bar.
  - 60-minute idle warning banner urging you to power off unused VPS instances.
  - Persistent post-build banner reminding you to delete your VPS once the APK is downloaded.
  - Complete uninstaller (`uninstall.sh`) with cryptographic data shredding.

---

## Architecture & Technology Stack

| Component | Technology | Description |
|---|---|---|
| **Backend** | Go 1.22+ / Gin | REST API, SSE streaming, build runner, process sandbox |
| **Frontend** | Angular 22 | Standalone components, reactive Signals, mobile-first CSS |
| **Terminal** | `@xterm/xterm` + `@xterm/addon-fit` | Canvas-accelerated ANSI terminal emulator |
| **Reverse Proxy** | Caddy 2 | Low-latency streaming proxy (`flush_interval -1`) with automatic HTTPS |
| **JDK** | OpenJDK 17 / 21 / `default-jdk` | Dynamically detected with automated `JAVA_HOME` configuration |
| **Android SDK** | `cmdline-tools` / `build-tools;34.0.0` | `platform-tools`, `platforms;android-34`, `zipalign`, `apksigner` |
| **Flutter SDK** | Flutter 3.47.9 / Dart 3.13.7 | Modern stable channel with automatic migration & precache |
| **Service** | systemd | Managed under unprivileged user `builder` |

---

## Quick Start (Ubuntu / Debian VPS)

### 1. Launch a Fresh Linux VPS
Create an Ubuntu (22.04 / 24.04 / Latest) or Debian (12 / 13) VPS with at least **2 vCPUs** and **4 GB RAM** (8 GB recommended for large Gradle/Flutter builds).

### 2. Run the One-Command Installer

```bash
curl -sSL https://raw.githubusercontent.com/abirsiddiky/APK-Builder/main/get.sh | sudo bash
```

Or pass custom flags directly through the pipe:
```bash
curl -sSL https://raw.githubusercontent.com/abirsiddiky/APK-Builder/main/get.sh | sudo bash -s -- --flutter --domain apk.yourdomain.com
```

#### Installer Flags:
```bash
sudo ./install.sh [options]  # (or pass flags via: curl ... | sudo bash -s -- [options])

  --domain <domain>        Configure Caddy with free automated HTTPS (Let's Encrypt)
  --flutter                Pre-install Flutter SDK into /opt/flutter (otherwise downloaded on demand)
  --warm-cache             Pre-warm Gradle caches to speed up initial project builds
  --reset-token            Force generate a new admin token even if one already exists
  --port <port>            Internal backend service port (default: 8080)
  --admin-token <token>    Set a predefined admin token instead of a generated one
```

**Example with Custom Domain and Pre-warmed Caches:**
```bash
sudo ./install.sh --domain apk.yourdomain.com --flutter --warm-cache
```

Once installation finishes, the script prints your web dashboard URL and a clearly highlighted admin access token box:
```
================================================================================
                     APK BUILDER INSTALLED SUCCESSFULLY!                        
================================================================================

  Web Dashboard URL:    https://apk.yourdomain.com

  +----------------------------------------------------------------------------+
  | ADMIN ACCESS TOKEN                                                         |
  +----------------------------------------------------------------------------+
    3f12a884c90e8a71b83d1c99831a3b1a207ecda03f4e240217983633ef1ab452
  +----------------------------------------------------------------------------+
    [IMPORTANT] Save it now! You need this token to log in and build APKs.
    (Stored securely in /etc/apkbuilder/env - chmod 600, owner root)
  +----------------------------------------------------------------------------+

  Service Status:       sudo systemctl status apkbuilder
  Live Server Logs:     sudo journalctl -u apkbuilder -f
  To Completely Remove: sudo ./uninstall.sh

  [REMINDER] Delete this VPS from your cloud provider panel when done
             to stop ongoing hourly billing!
================================================================================
```

---

## Updating an Existing Installation

To upgrade APK Builder to the latest version on an existing server while **preserving your admin token, keystores, and settings**:

```bash
cd ~/apk-builder
git pull
sudo ./install.sh
```

---

## Uninstallation (`uninstall.sh`)

When you are done building your APKs, you can wipe the app or completely clean your VPS using `uninstall.sh`.

### One-Command Pipe Uninstaller:
```bash
curl -sSL https://raw.githubusercontent.com/abirsiddiky/APK-Builder/main/uninstall.sh | sudo bash -s -- -y
```

### Or Run Locally:
```bash
sudo ./uninstall.sh [options]
```

#### Uninstaller Options:
```
  -y, --yes          Non-interactive mode (skips confirmation prompt)
  --remove-sdk       Also delete Android SDK (/opt/android-sdk), Flutter (/opt/flutter), and Gradle
  --remove-deps      Also uninstall OpenJDK and Caddy packages
  --purge-all        Wipe EVERYTHING: app, user, keystores, SDK, and dependencies
  -h, --help         Show help message
```

**Complete Purge Example:**
```bash
sudo ./uninstall.sh -y --purge-all
```

> **Data Destruction Notice:** Sensitive credentials, stored keys, and admin tokens in `/etc/apkbuilder/env` and `/var/lib/apkbuilder` are cryptographically shredded (`shred -u -z`) before files are deleted.

> **Cloud Cost Reminder:** To stop hourly billing completely, delete or destroy the VPS instance directly from your cloud provider's dashboard (Hetzner, DigitalOcean, Linode, AWS, etc.).

---

## Local Development & Manual Build

### Prerequisites
- Go 1.22+
- Node.js 20+ & npm
- JDK 17+ or 21+

### 1. Build the Angular 22 Frontend
```bash
npm run build --prefix frontend
```
*Outputs compiled assets directly into `web/dist/`.*

### 2. Build the Go Binary
```bash
go build -o apkbuilder ./cmd/server
```
*The Go compiler automatically embeds all static assets from `web/dist/`.*

### 3. Run Locally
```bash
export PORT=8080
export ADMIN_TOKEN=my-dev-token
export DATA_DIR=./data
./apkbuilder
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## API Endpoints

All endpoints except `POST /api/auth/login` require `Authorization: Bearer <token>` or `?token=<token>`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate with admin token (rate-limited) |
| `GET` | `/api/auth/check` | Verify token validity |
| `GET` | `/api/system/status` | Server uptime, idle warning, and active build info |
| `POST` | `/api/keystore/generate` | Generate RSA 2048 keystore via `keytool` |
| `GET` | `/api/keystore/download/:id` | Download generated `.keystore` |
| `GET` | `/api/keystore/info/:id` | Download `info.txt` with credentials & backup alert |
| `POST` | `/api/keystore/upload` | Multipart upload for existing `.jks` / `.keystore` |
| `POST` | `/api/build/start` | Start Android or Flutter build pipeline |
| `GET` | `/api/build/status` | Current pipeline stage and metadata |
| `GET` | `/api/build/logs` | Server-Sent Events (SSE) live log stream |
| `POST` | `/api/build/cancel` | Terminate running build process |
| `GET` | `/api/build/download` | Download generated APK artifact |
| `POST` | `/api/build/cleanup` | Wipe cloned repository and temporary build artifacts |

---

## Security Model

1. **Non-Root Execution:** The service runs under unprivileged user `builder` with systemd `NoNewPrivileges=true` and `ProtectSystem=full`.
2. **Credential Sanitization:** Git tokens are injected via process environment headers and masked from all command strings and logs (`[REDACTED]`). Keystore passwords are never printed.
3. **Restricted File Permissions:** Generated keystores and token hashes are written with mode `0600` inside a directory with mode `0700`.
4. **Data Destruction:** `uninstall.sh` shreds leftover keystores and token files using `shred -u` before deletion.

---

## License

MIT License. Free to use on personal and commercial cloud instances.
