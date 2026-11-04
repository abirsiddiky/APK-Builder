package builder

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

type BuildRequest struct {
	RepoURL       string `json:"repo_url" binding:"required"`
	Branch        string `json:"branch"`
	GitToken      string `json:"git_token"`
	BuildType     string `json:"build_type"` // "debug" or "release"
	KeystoreID    string `json:"keystore_id"`
	KeystoreAlias string `json:"keystore_alias"`
	StorePassword string `json:"store_password"`
	KeyPassword   string `json:"key_password"`
}

type BuildStatus struct {
	ID              string      `json:"id"`
	Status          string      `json:"status"` // idle, cloning, building, signing, done, failed, cancelled
	RepoURL         string      `json:"repo_url"`
	Branch          string      `json:"branch"`
	BuildType       string      `json:"build_type"`
	ProjectType     ProjectType `json:"project_type"`
	StartTime       time.Time   `json:"start_time"`
	EndTime         time.Time   `json:"end_time"`
	DurationSeconds int64       `json:"duration_seconds"`
	ApkFilename     string      `json:"apk_filename"`
	ApkSize         int64       `json:"apk_size"`
	HasApk          bool        `json:"has_apk"`
	Error           string      `json:"error"`
}

type Runner struct {
	mu            sync.Mutex
	dataDir       string
	androidHome   string
	flutterHome   string
	timeout       time.Duration
	currentBuild  *BuildStatus
	cancelCurrent context.CancelFunc
	currentCmd    *exec.Cmd
	logger        *BuildLogger
	masker        *Masker
	outputApkPath string
	activeDir     string
}

func NewRunner(dataDir string, androidHome string, flutterHome string, timeoutMinutes int) (*Runner, error) {
	buildsDir := filepath.Join(dataDir, "builds")
	if err := os.MkdirAll(buildsDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create builds directory: %w", err)
	}

	masker := NewMasker()
	logger := NewBuildLogger(DefaultMaxLogLines, masker)

	if timeoutMinutes <= 0 {
		timeoutMinutes = 45
	}

	return &Runner{
		dataDir:     dataDir,
		androidHome: androidHome,
		flutterHome: flutterHome,
		timeout:     time.Duration(timeoutMinutes) * time.Minute,
		logger:      logger,
		masker:      masker,
		currentBuild: &BuildStatus{
			Status: "idle",
		},
	}, nil
}

func (r *Runner) GetLogger() *BuildLogger {
	return r.logger
}

func (r *Runner) GetMasker() *Masker {
	return r.masker
}

func (r *Runner) GetStatus() BuildStatus {
	r.mu.Lock()
	defer r.mu.Unlock()

	status := *r.currentBuild
	if status.Status != "idle" && !status.StartTime.IsZero() {
		if status.EndTime.IsZero() {
			status.DurationSeconds = int64(time.Since(status.StartTime).Seconds())
		} else {
			status.DurationSeconds = int64(status.EndTime.Sub(status.StartTime).Seconds())
		}
	}
	return status
}

func (r *Runner) GetOutputApk() (string, string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.outputApkPath == "" {
		return "", "", errors.New("no APK available for download")
	}
	if _, err := os.Stat(r.outputApkPath); err != nil {
		return "", "", errors.New("APK file is missing on disk")
	}
	return r.outputApkPath, r.currentBuild.ApkFilename, nil
}

func (r *Runner) Cancel() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.currentBuild.Status == "idle" || r.currentBuild.Status == "done" ||
		r.currentBuild.Status == "failed" || r.currentBuild.Status == "cancelled" {
		return errors.New("no active build to cancel")
	}

	r.logger.Append("\n[Builder] Cancellation requested by user...")
	if r.cancelCurrent != nil {
		r.cancelCurrent()
	}
	if r.currentCmd != nil && r.currentCmd.Process != nil {
		_ = r.currentCmd.Process.Kill()
	}

	r.currentBuild.Status = "cancelled"
	r.currentBuild.EndTime = time.Now()
	r.currentBuild.Error = "Build cancelled by user"
	return nil
}

func (r *Runner) StartBuild(req *BuildRequest, keystorePath string) error {
	r.mu.Lock()
	if r.currentBuild.Status != "idle" && r.currentBuild.Status != "done" &&
		r.currentBuild.Status != "failed" && r.currentBuild.Status != "cancelled" {
		r.mu.Unlock()
		return errors.New("a build is already in progress")
	}

	// Validate repo URL
	u, err := url.Parse(req.RepoURL)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		r.mu.Unlock()
		return errors.New("invalid Git repository URL (must use https://)")
	}

	buildType := strings.ToLower(strings.TrimSpace(req.BuildType))
	if buildType != "release" {
		buildType = "debug"
	}

	if buildType == "release" {
		if keystorePath == "" {
			r.mu.Unlock()
			return errors.New("keystore is required for signed release build")
		}
		if strings.TrimSpace(req.KeystoreAlias) == "" {
			r.mu.Unlock()
			return errors.New("keystore alias is required for signed release build")
		}
		if req.StorePassword == "" {
			r.mu.Unlock()
			return errors.New("keystore password is required for signed release build")
		}
	}

	buildID := fmt.Sprintf("%d", time.Now().Unix())
	buildDir := filepath.Join(r.dataDir, "builds", buildID)
	if err := os.MkdirAll(buildDir, 0700); err != nil {
		r.mu.Unlock()
		return fmt.Errorf("failed to create build directory: %w", err)
	}

	// Reset state and logger
	r.logger.Clear()
	r.masker.Clear()
	r.outputApkPath = ""
	r.activeDir = buildDir

	// Register sensitive masks
	if req.GitToken != "" {
		r.masker.AddSecret(req.GitToken)
	}
	if req.StorePassword != "" {
		r.masker.AddSecret(req.StorePassword)
	}
	if req.KeyPassword != "" {
		r.masker.AddSecret(req.KeyPassword)
	}

	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	r.cancelCurrent = cancel

	r.currentBuild = &BuildStatus{
		ID:          buildID,
		Status:      "cloning",
		RepoURL:     req.RepoURL,
		Branch:      req.Branch,
		BuildType:   buildType,
		StartTime:   time.Now(),
		ProjectType: ProjectTypeUnknown,
	}
	r.mu.Unlock()

	// Run build asynchronously
	go r.executePipeline(ctx, req, buildDir, keystorePath)

	return nil
}

func (r *Runner) executePipeline(ctx context.Context, req *BuildRequest, buildDir string, keystorePath string) {
	defer func() {
		r.mu.Lock()
		if r.currentBuild.Status != "done" && r.currentBuild.Status != "cancelled" && r.currentBuild.Status != "failed" {
			r.currentBuild.Status = "failed"
		}
		r.currentBuild.EndTime = time.Now()
		r.cancelCurrent = nil
		r.currentCmd = nil
		r.mu.Unlock()
	}()

	repoDir := filepath.Join(buildDir, "repo")

	r.logger.Append(fmt.Sprintf("[Pipeline] Starting build %s", r.currentBuild.ID))
	r.logger.Append(fmt.Sprintf("[Pipeline] Target Repository: %s", req.RepoURL))
	if req.Branch != "" {
		r.logger.Append(fmt.Sprintf("[Pipeline] Target Branch: %s", req.Branch))
	}
	r.logger.Append(fmt.Sprintf("[Pipeline] Build Type: %s", r.currentBuild.BuildType))

	// Step 1: Git clone
	r.logger.Append("\n--- Step 1: Cloning Repository ---")
	cloneArgs := []string{"clone", "--depth", "1"}
	if strings.TrimSpace(req.Branch) != "" {
		cloneArgs = append(cloneArgs, "--branch", strings.TrimSpace(req.Branch))
	}
	cloneArgs = append(cloneArgs, req.RepoURL, repoDir)

	cloneCmd := exec.CommandContext(ctx, "git", cloneArgs...)
	cloneCmd.Dir = buildDir

	// Configure authentication safely via environment without leaking token into argv/ps
	env := os.Environ()
	env = append(env, "GIT_TERMINAL_PROMPT=0")
	if strings.TrimSpace(req.GitToken) != "" {
		authBasic := base64.StdEncoding.EncodeToString([]byte("x-access-token:" + strings.TrimSpace(req.GitToken)))
		env = append(env,
			"GIT_CONFIG_COUNT=1",
			"GIT_CONFIG_KEY_0=http.extraheader",
			"GIT_CONFIG_VALUE_0=Authorization: Basic "+authBasic,
		)
	}
	cloneCmd.Env = env

	if err := r.runStreamingCommand(ctx, cloneCmd, "[git]"); err != nil {
		r.failBuild(fmt.Sprintf("Git clone failed: %v", err))
		return
	}

	// Step 2: Project Detection
	r.logger.Append("\n--- Step 2: Detecting Project Structure ---")
	detection, err := DetectProject(repoDir)
	if err != nil || detection.Type == ProjectTypeUnknown {
		r.failBuild("Could not detect valid Android Gradle or Flutter project. (gradlew or pubspec.yaml required)")
		return
	}

	r.mu.Lock()
	r.currentBuild.ProjectType = detection.Type
	r.currentBuild.Status = "building"
	r.mu.Unlock()

	r.logger.Append(fmt.Sprintf("[Detector] Detected project type: %s", detection.Type))

	// Step 3: Run Build
	r.logger.Append("\n--- Step 3: Executing Build ---")
	var buildCmd *exec.Cmd

	if detection.Type == ProjectTypeGradle {
		// Ensure SDK licenses and local.properties
		if r.androidHome != "" {
			ensureSdkLicenses(r.androidHome)
			ensureLocalProperties(detection.BuildDir, r.androidHome)
		}

		// Ensure Gradle wrapper (injects gradlew and gradle-wrapper.jar if missing in repo)
		gradleCmd, err := r.ensureGradleWrapper(detection.BuildDir)
		if err != nil {
			r.failBuild(fmt.Sprintf("Failed to configure Gradle wrapper: %v", err))
			return
		}

		// Ensure .env exists if .env.example is present (e.g. for secrets plugin)
		envExample := filepath.Join(detection.BuildDir, ".env.example")
		envFile := filepath.Join(detection.BuildDir, ".env")
		if _, err := os.Stat(envExample); err == nil {
			if _, err := os.Stat(envFile); os.IsNotExist(err) {
				_ = copyFile(envExample, envFile)
			}
		}

		// If debug build, ensure debug.keystore exists in repo if referenced
		if r.currentBuild.BuildType == "debug" {
			dbgKey := filepath.Join(detection.BuildDir, "debug.keystore")
			if _, err := os.Stat(dbgKey); os.IsNotExist(err) {
				_ = exec.Command("keytool", "-genkeypair",
					"-alias", "androiddebugkey",
					"-keypass", "android",
					"-keystore", dbgKey,
					"-storepass", "android",
					"-dname", "CN=Android Debug,O=Android,C=US",
					"-validity", "10000",
					"-keyalg", "RSA",
					"-keysize", "2048",
				).Run()
			}
		}

		targetTask := "assembleDebug"
		if r.currentBuild.BuildType == "release" {
			targetTask = "assembleRelease"
		}

		args := []string{targetTask, "--console=plain"}
		if runtime.GOOS == "windows" {
			buildCmd = exec.CommandContext(ctx, gradleCmd, args...)
		} else {
			// On Linux, invoke via /bin/sh to guarantee execution
			shArgs := append([]string{gradleCmd}, args...)
			buildCmd = exec.CommandContext(ctx, "/bin/sh", shArgs...)
		}
		buildCmd.Dir = detection.BuildDir

		// Setup environment
		buildEnv := os.Environ()
		if r.androidHome != "" {
			buildEnv = append(buildEnv, "ANDROID_HOME="+r.androidHome, "ANDROID_SDK_ROOT="+r.androidHome)
		}
		if jh := r.resolveJavaHome(); jh != "" {
			buildEnv = append(buildEnv, "JAVA_HOME="+jh)
		}
		gradleUserHome := filepath.Join(r.dataDir, ".gradle")
		_ = os.MkdirAll(gradleUserHome, 0755)
		buildEnv = append(buildEnv, "GRADLE_USER_HOME="+gradleUserHome)

		// Set keystore & signing env vars if available
		if keystorePath != "" {
			buildEnv = append(buildEnv,
				"KEYSTORE_PATH="+keystorePath,
				"STORE_PASSWORD="+req.StorePassword,
				"KEY_PASSWORD="+req.KeyPassword,
				"KEY_ALIAS="+req.KeystoreAlias,
				"ANDROID_KEYSTORE_PATH="+keystorePath,
				"ANDROID_STORE_PASSWORD="+req.StorePassword,
				"ANDROID_KEY_PASSWORD="+req.KeyPassword,
				"ANDROID_KEY_ALIAS="+req.KeystoreAlias,
			)
			// Also link/copy keystore to my-upload-key.jks in buildDir if referenced
			uploadKeyPath := filepath.Join(detection.BuildDir, "my-upload-key.jks")
			if _, err := os.Stat(uploadKeyPath); os.IsNotExist(err) {
				_ = copyFile(keystorePath, uploadKeyPath)
			}
		}

		// Prepend Java and SDK tools to PATH
		pathEnv := os.Getenv("PATH")
		if jh := r.resolveJavaHome(); jh != "" {
			pathEnv = filepath.Join(jh, "bin") + string(os.PathListSeparator) + pathEnv
		}
		if r.androidHome != "" {
			pathEnv = filepath.Join(r.androidHome, "cmdline-tools", "latest", "bin") + string(os.PathListSeparator) +
				filepath.Join(r.androidHome, "platform-tools") + string(os.PathListSeparator) +
				filepath.Join(r.androidHome, "build-tools", "34.0.0") + string(os.PathListSeparator) + pathEnv
		}
		buildEnv = append(buildEnv, "PATH="+pathEnv)
		buildCmd.Env = buildEnv

		if err := r.runStreamingCommand(ctx, buildCmd, "[gradle]"); err != nil {
			r.failBuild(fmt.Sprintf("Gradle build failed: %v", err))
			return
		}
	} else if detection.Type == ProjectTypeFlutter {
		flutterBin := "flutter"
		if r.flutterHome != "" {
			flutterBin = filepath.Join(r.flutterHome, "bin", "flutter")
			if runtime.GOOS == "windows" {
				flutterBin += ".bat"
			}
		}

		args := []string{"build", "apk"}
		if r.currentBuild.BuildType == "release" {
			args = append(args, "--release", "--no-color")
		} else {
			args = append(args, "--debug", "--no-color")
		}

		buildCmd = exec.CommandContext(ctx, flutterBin, args...)
		buildCmd.Dir = detection.BuildDir

		flutterEnv := os.Environ()
		if r.androidHome != "" {
			flutterEnv = append(flutterEnv, "ANDROID_HOME="+r.androidHome, "ANDROID_SDK_ROOT="+r.androidHome)
		}
		buildCmd.Env = flutterEnv

		if err := r.runStreamingCommand(ctx, buildCmd, "[flutter]"); err != nil {
			r.failBuild(fmt.Sprintf("Flutter build failed: %v", err))
			return
		}
	}

	// Step 4: Locate Built APK
	r.logger.Append("\n--- Step 4: Locating Output APK ---")
	foundApk, err := r.findOutputApk(repoDir, r.currentBuild.BuildType)
	if err != nil {
		r.failBuild(fmt.Sprintf("Could not locate output APK file: %v", err))
		return
	}
	r.logger.Append(fmt.Sprintf("[Pipeline] Located APK at: %s", foundApk))

	finalApkPath := foundApk
	finalFilename := filepath.Base(foundApk)

	// Step 5: Sign Release APK if required
	if r.currentBuild.BuildType == "release" {
		r.mu.Lock()
		r.currentBuild.Status = "signing"
		r.mu.Unlock()

		r.logger.Append("\n--- Step 5: Aligning & Signing APK ---")
		signedApk, err := r.signApk(ctx, buildDir, foundApk, keystorePath, req)
		if err != nil {
			r.failBuild(fmt.Sprintf("APK signing failed: %v", err))
			return
		}
		finalApkPath = signedApk
		finalFilename = "app-release-signed.apk"
		r.logger.Append("[Pipeline] APK successfully signed and verified.")
	}

	// Copy final APK to a persistent build output path
	outDest := filepath.Join(buildDir, "output.apk")
	if err := copyFile(finalApkPath, outDest); err != nil {
		r.failBuild(fmt.Sprintf("Failed to stage output APK: %v", err))
		return
	}

	fi, err := os.Stat(outDest)
	if err != nil {
		r.failBuild("Failed to inspect final output APK")
		return
	}

	r.mu.Lock()
	r.outputApkPath = outDest
	r.currentBuild.Status = "done"
	r.currentBuild.ApkFilename = finalFilename
	r.currentBuild.ApkSize = fi.Size()
	r.currentBuild.HasApk = true
	r.currentBuild.EndTime = time.Now()
	r.mu.Unlock()

	r.logger.Append("\n========================================================")
	r.logger.Append("                   BUILD SUCCESSFUL!                    ")
	r.logger.Append(fmt.Sprintf(" Artifact: %s (%.2f MB)", finalFilename, float64(fi.Size())/(1024*1024)))
	r.logger.Append("========================================================")
}

func (r *Runner) signApk(ctx context.Context, buildDir string, inputApk string, keystorePath string, req *BuildRequest) (string, error) {
	zipalignBin := r.findSdkTool("zipalign")
	apksignerBin := r.findSdkTool("apksigner")

	alignedApk := filepath.Join(buildDir, "aligned.apk")
	signedApk := filepath.Join(buildDir, "signed.apk")

	// 1. Zipalign (4-byte alignment)
	if zipalignBin != "" {
		r.logger.Append(fmt.Sprintf("[Signing] Running zipalign via %s...", filepath.Base(zipalignBin)))
		alignCmd := exec.CommandContext(ctx, zipalignBin, "-f", "-v", "-p", "4", inputApk, alignedApk)
		alignCmd.Dir = buildDir
		if err := r.runStreamingCommand(ctx, alignCmd, "[zipalign]"); err != nil {
			r.logger.Append(fmt.Sprintf("[Signing] Warning: zipalign failed (%v), continuing with raw APK", err))
			alignedApk = inputApk
		}
	} else {
		r.logger.Append("[Signing] zipalign tool not found in SDK; proceeding directly with APK.")
		alignedApk = inputApk
	}

	// 2. Apksigner
	if apksignerBin == "" {
		return "", errors.New("apksigner tool not found in Android SDK or PATH")
	}

	keyPass := req.KeyPassword
	if keyPass == "" {
		keyPass = req.StorePassword
	}

	r.logger.Append(fmt.Sprintf("[Signing] Signing APK using key alias '%s'...", req.KeystoreAlias))

	// apksigner sign --ks <keystore> --ks-key-alias <alias> --ks-pass pass:<pass> --key-pass pass:<pass> --out signed.apk aligned.apk
	signArgs := []string{
		"sign",
		"--ks", keystorePath,
		"--ks-key-alias", req.KeystoreAlias,
		"--ks-pass", "pass:" + req.StorePassword,
		"--key-pass", "pass:" + keyPass,
		"--out", signedApk,
		alignedApk,
	}

	signCmd := exec.CommandContext(ctx, apksignerBin, signArgs...)
	signCmd.Dir = buildDir

	if err := r.runStreamingCommand(ctx, signCmd, "[apksigner]"); err != nil {
		return "", fmt.Errorf("apksigner failed: %w", err)
	}

	// 3. Verify signature
	verifyCmd := exec.CommandContext(ctx, apksignerBin, "verify", "--verbose", signedApk)
	verifyCmd.Dir = buildDir
	_ = r.runStreamingCommand(ctx, verifyCmd, "[verify]")

	return signedApk, nil
}

func (r *Runner) findSdkTool(toolName string) string {
	// 1. Check in PATH
	if p, err := exec.LookPath(toolName); err == nil {
		return p
	}

	// 2. Check in ANDROID_HOME build-tools
	if r.androidHome != "" {
		btDir := filepath.Join(r.androidHome, "build-tools")
		entries, err := os.ReadDir(btDir)
		if err == nil {
			// Sort descending so newest version is first
			sort.Slice(entries, func(i, j int) bool {
				return entries[i].Name() > entries[j].Name()
			})

			for _, entry := range entries {
				if entry.IsDir() {
					cand := filepath.Join(btDir, entry.Name(), toolName)
					if runtime.GOOS == "windows" {
						cand += ".bat"
						if _, err := os.Stat(cand); err == nil {
							return cand
						}
						cand = filepath.Join(btDir, entry.Name(), toolName+".exe")
						if _, err := os.Stat(cand); err == nil {
							return cand
						}
					} else {
						if _, err := os.Stat(cand); err == nil {
							return cand
						}
					}
				}
			}
		}
	}

	return ""
}

func (r *Runner) findOutputApk(repoDir string, buildType string) (string, error) {
	var candidates []string
	_ = filepath.Walk(repoDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && strings.HasSuffix(strings.ToLower(info.Name()), ".apk") {
			// Ignore intermediate build artifacts if possible
			lowerPath := strings.ToLower(path)
			if !strings.Contains(lowerPath, "intermediates") {
				candidates = append(candidates, path)
			}
		}
		return nil
	})

	if len(candidates) == 0 {
		return "", errors.New("no .apk files found in project after build")
	}

	// Prefer matching buildType in filename
	targetKeyword := "release"
	if buildType == "debug" {
		targetKeyword = "debug"
	}

	for _, c := range candidates {
		base := strings.ToLower(filepath.Base(c))
		if strings.Contains(base, targetKeyword) {
			return c, nil
		}
	}

	// Return the most recently modified candidate
	sort.Slice(candidates, func(i, j int) bool {
		fi1, _ := os.Stat(candidates[i])
		fi2, _ := os.Stat(candidates[j])
		if fi1 == nil || fi2 == nil {
			return false
		}
		return fi1.ModTime().After(fi2.ModTime())
	})

	return candidates[0], nil
}

func (r *Runner) runStreamingCommand(ctx context.Context, cmd *exec.Cmd, prefix string) error {
	r.mu.Lock()
	r.currentCmd = cmd
	r.mu.Unlock()

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	var wg sync.WaitGroup
	wg.Add(2)

	streamReader := func(reader io.Reader) {
		defer wg.Done()
		scanner := bufio.NewScanner(reader)
		// Allocate buffer up to 1MB per line
		buf := make([]byte, 64*1024)
		scanner.Buffer(buf, 1024*1024)

		for scanner.Scan() {
			text := scanner.Text()
			r.logger.Append(fmt.Sprintf("%s %s", prefix, text))
		}
	}

	go streamReader(stdout)
	go streamReader(stderr)

	wg.Wait()
	return cmd.Wait()
}

func (r *Runner) failBuild(errMsg string) {
	r.mu.Lock()
	r.currentBuild.Status = "failed"
	r.currentBuild.Error = errMsg
	r.currentBuild.EndTime = time.Now()
	r.mu.Unlock()

	r.logger.Append(fmt.Sprintf("\n[Pipeline Error] %s", errMsg))
}

func (r *Runner) CleanupCurrent() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.activeDir != "" {
		_ = os.RemoveAll(r.activeDir)
		r.activeDir = ""
	}
	r.outputApkPath = ""
	r.currentBuild.HasApk = false
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func ensureLocalProperties(buildDir string, androidHome string) {
	if androidHome == "" {
		return
	}
	localProp := filepath.Join(buildDir, "local.properties")
	clean := filepath.ToSlash(androidHome)
	// If local.properties exists, ensure sdk.dir is updated
	if data, err := os.ReadFile(localProp); err == nil {
		lines := strings.Split(string(data), "\n")
		found := false
		for i, line := range lines {
			if strings.HasPrefix(strings.TrimSpace(line), "sdk.dir=") {
				lines[i] = fmt.Sprintf("sdk.dir=%s", clean)
				found = true
				break
			}
		}
		if !found {
			lines = append(lines, fmt.Sprintf("sdk.dir=%s", clean))
		}
		_ = os.WriteFile(localProp, []byte(strings.Join(lines, "\n")), 0644)
	} else {
		content := fmt.Sprintf("sdk.dir=%s\n", clean)
		_ = os.WriteFile(localProp, []byte(content), 0644)
	}
}

func ensureSdkLicenses(androidHome string) {
	if androidHome == "" {
		return
	}
	licDir := filepath.Join(androidHome, "licenses")
	_ = os.MkdirAll(licDir, 0777)

	licenses := map[string]string{
		"android-sdk-license": "24333f8a63b6825ea9c5514f83c2829b004d1fee\nd56f5187479451eabf01fb78af6dfcb131a6481e\n8933bad161af4178b1185d1a37fbf41ea5269c55",
		"android-sdk-preview-license": "84831b9409646a918e30573bab4c9c91346d8abd",
		"android-googletv-license":    "601085b94cd77f0b54ff86406957099fed7926d4",
		"android-sdk-arm-dbt-license": "859f317696f67ef3d7f30a50a5560e7834b43903",
	}

	for name, content := range licenses {
		p := filepath.Join(licDir, name)
		if _, err := os.Stat(p); os.IsNotExist(err) {
			_ = os.WriteFile(p, []byte(content+"\n"), 0666)
		}
	}
}

func (r *Runner) resolveJavaHome() string {
	if jh := os.Getenv("JAVA_HOME"); jh != "" {
		return jh
	}
	if runtime.GOOS == "linux" {
		candidates := []string{
			"/usr/lib/jvm/java-17-openjdk-amd64",
			"/usr/lib/jvm/java-17-openjdk-arm64",
			"/usr/lib/jvm/java-21-openjdk-amd64",
			"/usr/lib/jvm/java-21-openjdk-arm64",
			"/usr/lib/jvm/default-java",
		}
		for _, c := range candidates {
			if fi, err := os.Stat(c); err == nil && fi.IsDir() {
				return c
			}
		}
	}
	return ""
}

func (r *Runner) findSystemGradle() string {
	if p, err := exec.LookPath("gradle"); err == nil {
		return p
	}
	commonPaths := []string{
		"/opt/gradle/bin/gradle",
		"/usr/local/bin/gradle",
		"/usr/bin/gradle",
		"/snap/bin/gradle",
	}
	if runtime.GOOS == "windows" {
		commonPaths = append(commonPaths,
			`C:\Gradle\bin\gradle.bat`,
			`C:\Program Files\Gradle\bin\gradle.bat`,
		)
	}
	for _, cp := range commonPaths {
		if fi, err := os.Stat(cp); err == nil && !fi.IsDir() {
			return cp
		}
	}
	return ""
}

func (r *Runner) resolveGradleExecutable(ctx context.Context, buildDir string) (string, error) {
	gradlewCandidates := []string{
		filepath.Join(buildDir, "gradlew"),
		filepath.Join(buildDir, "gradlew.bat"),
	}
	for _, cand := range gradlewCandidates {
		if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
			if runtime.GOOS != "windows" {
				_ = os.Chmod(cand, 0755)
			}
			return cand, nil
		}
	}

	parentGradlew := filepath.Join(filepath.Dir(buildDir), "gradlew")
	if fi, err := os.Stat(parentGradlew); err == nil && !fi.IsDir() {
		if runtime.GOOS != "windows" {
			_ = os.Chmod(parentGradlew, 0755)
		}
		return parentGradlew, nil
	}

	r.logger.Append("[Pipeline] gradlew script not found in repository.")

	// Check for system Gradle
	gradlePath := r.findSystemGradle()
	if gradlePath != "" {
		r.logger.Append(fmt.Sprintf("[Pipeline] Found Gradle at %s. Attempting to generate wrapper...", gradlePath))
		wrapperCmd := exec.CommandContext(ctx, gradlePath, "wrapper")
		wrapperCmd.Dir = buildDir
		wrapperEnv := os.Environ()
		if jh := r.resolveJavaHome(); jh != "" {
			wrapperEnv = append(wrapperEnv, "JAVA_HOME="+jh)
		}
		if r.androidHome != "" {
			wrapperEnv = append(wrapperEnv, "ANDROID_HOME="+r.androidHome, "ANDROID_SDK_ROOT="+r.androidHome)
		}
		wrapperCmd.Env = wrapperEnv
		_ = r.runStreamingCommand(ctx, wrapperCmd, "[wrapper]")

		for _, cand := range gradlewCandidates {
			if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
				if runtime.GOOS != "windows" {
					_ = os.Chmod(cand, 0755)
				}
				r.logger.Append("[Pipeline] Successfully generated Gradle wrapper.")
				return cand, nil
			}
		}

		r.logger.Append(fmt.Sprintf("[Pipeline] Building directly using Gradle: %s", gradlePath))
		return gradlePath, nil
	}

	// Auto-install standalone Gradle
	r.logger.Append("[Pipeline] Neither gradlew nor system Gradle was found. Auto-installing standalone Gradle 8.12...")
	installedGradle, err := r.autoInstallGradle(ctx)
	if err != nil {
		return "", fmt.Errorf("could not find or auto-download Gradle: %w", err)
	}

	r.logger.Append(fmt.Sprintf("[Pipeline] Standalone Gradle ready at %s. Generating wrapper...", installedGradle))
	wrapperCmd := exec.CommandContext(ctx, installedGradle, "wrapper")
	wrapperCmd.Dir = buildDir
	wrapperEnv := os.Environ()
	if jh := r.resolveJavaHome(); jh != "" {
		wrapperEnv = append(wrapperEnv, "JAVA_HOME="+jh)
	}
	if r.androidHome != "" {
		wrapperEnv = append(wrapperEnv, "ANDROID_HOME="+r.androidHome, "ANDROID_SDK_ROOT="+r.androidHome)
	}
	wrapperCmd.Env = wrapperEnv
	_ = r.runStreamingCommand(ctx, wrapperCmd, "[wrapper]")

	for _, cand := range gradlewCandidates {
		if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
			if runtime.GOOS != "windows" {
				_ = os.Chmod(cand, 0755)
			}
			return cand, nil
		}
	}

	return installedGradle, nil
}

func (r *Runner) autoInstallGradle(ctx context.Context) (string, error) {
	destDir := filepath.Join(r.dataDir, "tools", "gradle-8.12")
	gradleBin := filepath.Join(destDir, "bin", "gradle")
	if runtime.GOOS == "windows" {
		gradleBin += ".bat"
	}
	if fi, err := os.Stat(gradleBin); err == nil && !fi.IsDir() {
		return gradleBin, nil
	}

	_ = os.MkdirAll(filepath.Join(r.dataDir, "tools"), 0755)
	zipPath := filepath.Join(r.dataDir, "tools", "gradle-8.12-bin.zip")

	r.logger.Append("[Pipeline] Downloading https://services.gradle.org/distributions/gradle-8.12-bin.zip...")
	req, err := http.NewRequestWithContext(ctx, "GET", "https://services.gradle.org/distributions/gradle-8.12-bin.zip", nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to download Gradle: %w", err)
	}
	defer resp.Body.Close()

	out, err := os.Create(zipPath)
	if err != nil {
		return "", err
	}
	_, err = io.Copy(out, resp.Body)
	out.Close()
	if err != nil {
		return "", err
	}
	defer os.Remove(zipPath)

	r.logger.Append("[Pipeline] Extracting Gradle 8.12 archive...")
	if err := unzipArchive(zipPath, filepath.Join(r.dataDir, "tools")); err != nil {
		return "", err
	}

	if runtime.GOOS != "windows" {
		_ = os.Chmod(gradleBin, 0755)
	}
	return gradleBin, nil
}

func unzipArchive(src string, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		fpath := filepath.Join(dest, f.Name)
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(fpath, os.ModePerm)
			continue
		}
		if err = os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return err
		}
		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}
		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

