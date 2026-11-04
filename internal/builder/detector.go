package builder

import (
	"os"
	"path/filepath"
	"strings"
)

type ProjectType string

const (
	ProjectTypeUnknown ProjectType = "unknown"
	ProjectTypeGradle  ProjectType = "android-gradle"
	ProjectTypeFlutter ProjectType = "flutter"
)

type DetectionResult struct {
	Type       ProjectType
	RootDir    string
	BuildDir   string // Subdirectory containing gradlew or pubspec.yaml
	GradlewCmd string
}

func DetectProject(repoDir string) (*DetectionResult, error) {
	// 1. Check for Flutter in repoDir
	pubspecPath := filepath.Join(repoDir, "pubspec.yaml")
	if data, err := os.ReadFile(pubspecPath); err == nil {
		if strings.Contains(string(data), "flutter:") {
			return &DetectionResult{
				Type:     ProjectTypeFlutter,
				RootDir:  repoDir,
				BuildDir: repoDir,
			}, nil
		}
	}

	// 2. Check for Gradle in repoDir
	gradlewCandidates := []string{
		filepath.Join(repoDir, "gradlew"),
		filepath.Join(repoDir, "gradlew.bat"),
	}
	for _, cand := range gradlewCandidates {
		if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
			return &DetectionResult{
				Type:       ProjectTypeGradle,
				RootDir:    repoDir,
				BuildDir:   repoDir,
				GradlewCmd: cand,
			}, nil
		}
	}

	// 3. Check for Android subfolder (e.g. android/gradlew)
	androidSubdir := filepath.Join(repoDir, "android")
	if fi, err := os.Stat(androidSubdir); err == nil && fi.IsDir() {
		for _, cand := range []string{filepath.Join(androidSubdir, "gradlew"), filepath.Join(androidSubdir, "gradlew.bat")} {
			if sfi, err := os.Stat(cand); err == nil && !sfi.IsDir() {
				return &DetectionResult{
					Type:       ProjectTypeGradle,
					RootDir:    repoDir,
					BuildDir:   androidSubdir,
					GradlewCmd: cand,
				}, nil
			}
		}
	}

	// 4. Check if settings.gradle or build.gradle exists even if gradlew is missing
	if _, err := os.Stat(filepath.Join(repoDir, "build.gradle")); err == nil {
		return &DetectionResult{
			Type:       ProjectTypeGradle,
			RootDir:    repoDir,
			BuildDir:   repoDir,
			GradlewCmd: "gradle",
		}, nil
	}
	if _, err := os.Stat(filepath.Join(repoDir, "build.gradle.kts")); err == nil {
		return &DetectionResult{
			Type:       ProjectTypeGradle,
			RootDir:    repoDir,
			BuildDir:   repoDir,
			GradlewCmd: "gradle",
		}, nil
	}

	return &DetectionResult{
		Type:    ProjectTypeUnknown,
		RootDir: repoDir,
	}, nil
}

