package builder

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

//go:embed wrapper_assets/gradlew
var gradlewScript []byte

//go:embed wrapper_assets/gradlew.bat
var gradlewBatScript []byte

//go:embed wrapper_assets/gradle-wrapper.jar
var gradleWrapperJar []byte

const defaultGradleWrapperProperties = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.12-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`

func (r *Runner) ensureGradleWrapper(buildDir string) (string, error) {
	// 1. Target paths
	gradlewPath := filepath.Join(buildDir, "gradlew")
	gradlewBatPath := filepath.Join(buildDir, "gradlew.bat")
	wrapperDir := filepath.Join(buildDir, "gradle", "wrapper")
	jarPath := filepath.Join(wrapperDir, "gradle-wrapper.jar")
	propsPath := filepath.Join(wrapperDir, "gradle-wrapper.properties")

	_ = os.MkdirAll(wrapperDir, 0755)

	// 2. Ensure gradlew script exists and is non-empty
	fi, err := os.Stat(gradlewPath)
	if os.IsNotExist(err) || (err == nil && fi.Size() == 0) {
		r.logger.Append("[Pipeline] Repository missing 'gradlew'. Injecting universal Gradle wrapper script...")
		if err := os.WriteFile(gradlewPath, gradlewScript, 0755); err != nil {
			return "", fmt.Errorf("failed to inject gradlew: %w", err)
		}
	} else if runtime.GOOS != "windows" {
		_ = os.Chmod(gradlewPath, 0755)
	}

	// 3. Ensure gradlew.bat exists on Windows
	if runtime.GOOS == "windows" {
		if bfi, err := os.Stat(gradlewBatPath); os.IsNotExist(err) || (err == nil && bfi.Size() == 0) {
			_ = os.WriteFile(gradlewBatPath, gradlewBatScript, 0755)
		}
	}

	// 4. Ensure gradle-wrapper.jar exists and is non-empty (the vital binary missing from many git repos)
	if jfi, err := os.Stat(jarPath); os.IsNotExist(err) || (err == nil && jfi.Size() == 0) {
		r.logger.Append("[Pipeline] Repository missing 'gradle-wrapper.jar'. Injecting Gradle wrapper JAR...")
		if err := os.WriteFile(jarPath, gradleWrapperJar, 0644); err != nil {
			return "", fmt.Errorf("failed to inject gradle-wrapper.jar: %w", err)
		}
	}

	// 5. Ensure gradle-wrapper.properties exists (if already present, PRESERVE project's required Gradle version!)
	if _, err := os.Stat(propsPath); os.IsNotExist(err) {
		r.logger.Append("[Pipeline] Generating default 'gradle-wrapper.properties' (Gradle 8.12)...")
		if err := os.WriteFile(propsPath, []byte(defaultGradleWrapperProperties), 0644); err != nil {
			return "", fmt.Errorf("failed to write gradle-wrapper.properties: %w", err)
		}
	}

	if runtime.GOOS == "windows" {
		return gradlewBatPath, nil
	}
	return gradlewPath, nil
}
