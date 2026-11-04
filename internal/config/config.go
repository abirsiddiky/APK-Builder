package config

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
)

type Config struct {
	Port                string
	DataDir             string
	AndroidHome         string
	FlutterHome         string
	KeytoolBin          string
	AdminTokenOverride  string
	BuildTimeoutMinutes int
	IdleWarningMinutes  int
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		if runtime.GOOS == "linux" {
			dataDir = "/var/lib/apkbuilder"
		} else {
			dataDir = filepath.Join(".", "data")
		}
	}

	androidHome := os.Getenv("ANDROID_HOME")
	if androidHome == "" {
		androidHome = os.Getenv("ANDROID_SDK_ROOT")
	}
	if androidHome == "" && runtime.GOOS == "linux" {
		if _, err := os.Stat("/opt/android-sdk"); err == nil {
			androidHome = "/opt/android-sdk"
		}
	}

	flutterHome := os.Getenv("FLUTTER_ROOT")
	if flutterHome == "" && runtime.GOOS == "linux" {
		if _, err := os.Stat("/opt/flutter"); err == nil {
			flutterHome = "/opt/flutter"
		}
	}

	keytoolBin := findKeytool()

	timeoutMin := 45
	if tStr := os.Getenv("BUILD_TIMEOUT_MINUTES"); tStr != "" {
		if val, err := strconv.Atoi(tStr); err == nil && val > 0 {
			timeoutMin = val
		}
	}

	idleWarningMin := 60
	if iStr := os.Getenv("IDLE_WARNING_MINUTES"); iStr != "" {
		if val, err := strconv.Atoi(iStr); err == nil && val > 0 {
			idleWarningMin = val
		}
	}

	return &Config{
		Port:                port,
		DataDir:             dataDir,
		AndroidHome:         androidHome,
		FlutterHome:         flutterHome,
		KeytoolBin:          keytoolBin,
		AdminTokenOverride:  os.Getenv("ADMIN_TOKEN"),
		BuildTimeoutMinutes: timeoutMin,
		IdleWarningMinutes:  idleWarningMin,
	}
}

func findKeytool() string {
	// 1. Check PATH
	if p, err := exec.LookPath("keytool"); err == nil {
		return p
	}
	// 2. Check JAVA_HOME
	if jh := os.Getenv("JAVA_HOME"); jh != "" {
		candidate := filepath.Join(jh, "bin", "keytool")
		if runtime.GOOS == "windows" {
			candidate += ".exe"
		}
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	// 3. Check common JDK paths on Windows
	if runtime.GOOS == "windows" {
		commonPaths := []string{
			`C:\Program Files\Java\jdk-27.0.1.0.3\bin\keytool.exe`,
			`C:\Program Files\Java\jdk-21\bin\keytool.exe`,
			`C:\Program Files\Java\jdk-17\bin\keytool.exe`,
		}
		for _, cp := range commonPaths {
			if _, err := os.Stat(cp); err == nil {
				return cp
			}
		}
	}
	// Fallback to "keytool" command name
	return "keytool"
}

