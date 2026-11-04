package keystore

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type GenerateRequest struct {
	Alias         string `json:"alias" binding:"required"`
	StorePassword string `json:"store_password" binding:"required"`
	KeyPassword   string `json:"key_password"`
	CommonName    string `json:"common_name" binding:"required"`
	Organization  string `json:"organization"`
	Country       string `json:"country"`
	ValidityYears int    `json:"validity_years"`
}

type KeystoreDetails struct {
	ID            string    `json:"id"`
	Alias         string    `json:"alias"`
	StorePassword string    `json:"store_password"`
	KeyPassword   string    `json:"key_password"`
	FilePath      string    `json:"file_path"`
	InfoPath      string    `json:"info_path"`
	CreatedAt     time.Time `json:"created_at"`
	IsGenerated   bool      `json:"is_generated"`
}

type Manager struct {
	baseDir    string
	keytoolBin string
}

func NewManager(dataDir string, keytoolBin string) (*Manager, error) {
	ksDir := filepath.Join(dataDir, "keystores")
	if err := os.MkdirAll(ksDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create keystores directory: %w", err)
	}
	return &Manager{
		baseDir:    ksDir,
		keytoolBin: keytoolBin,
	}, nil
}

func generateID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (m *Manager) Generate(req *GenerateRequest) (*KeystoreDetails, error) {
	alias := strings.TrimSpace(req.Alias)
	if alias == "" {
		return nil, errors.New("key alias cannot be empty")
	}
	storePass := req.StorePassword
	if len(storePass) < 6 {
		return nil, errors.New("store password must be at least 6 characters")
	}
	keyPass := req.KeyPassword
	if keyPass == "" {
		keyPass = storePass
	} else if len(keyPass) < 6 {
		return nil, errors.New("key password must be at least 6 characters")
	}

	validityYears := req.ValidityYears
	if validityYears <= 0 {
		validityYears = 25
	}
	validityDays := validityYears * 365

	cn := strings.TrimSpace(req.CommonName)
	if cn == "" {
		cn = "Android Developer"
	}
	org := strings.TrimSpace(req.Organization)
	if org == "" {
		org = "Android Organization"
	}
	country := strings.TrimSpace(req.Country)
	if country == "" {
		country = "US"
	} else if len(country) > 2 {
		country = country[:2]
	}
	country = strings.ToUpper(country)

	dname := fmt.Sprintf("CN=%s, OU=Mobile, O=%s, C=%s", cn, org, country)

	id := generateID()
	ksDir := filepath.Join(m.baseDir, id)
	if err := os.MkdirAll(ksDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create keystore folder: %w", err)
	}

	ksPath := filepath.Join(ksDir, "release.keystore")
	infoPath := filepath.Join(ksDir, "info.txt")

	// keytool -genkeypair -v -keystore <path> -alias <alias> -keyalg RSA -keysize 2048 -validity <days> -dname <dname> -storepass <pass> -keypass <pass>
	args := []string{
		"-genkeypair",
		"-v",
		"-keystore", ksPath,
		"-alias", alias,
		"-keyalg", "RSA",
		"-keysize", "2048",
		"-validity", fmt.Sprintf("%d", validityDays),
		"-dname", dname,
		"-storepass", storePass,
		"-keypass", keyPass,
	}

	cmd := exec.Command(m.keytoolBin, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		_ = os.RemoveAll(ksDir)
		return nil, fmt.Errorf("keytool failed: %w (output: %s)", err, string(output))
	}

	// Chmod 0600 on keystore file
	_ = os.Chmod(ksPath, 0600)

	// Write info.txt
	infoContent := fmt.Sprintf(`APK BUILDER - KEYSTORE INFORMATION
================================================================================
Generated:         %s
Key Alias:         %s
Keystore Password: %s
Key Password:      %s
Validity:          %d years (%d days)
Common Name (CN):  %s
Organization (O):  %s
Country (C):       %s
================================================================================
IMPORTANT WARNING:
If you lose this keystore or forget these passwords, you can NEVER update your
app on the Google Play Store or any other Android distribution channel.
Back up both this keystore file and this info.txt to a secure location immediately.
================================================================================
`,
		time.Now().Format(time.RFC1123),
		alias,
		storePass,
		keyPass,
		validityYears,
		validityDays,
		cn,
		org,
		country,
	)

	if err := os.WriteFile(infoPath, []byte(infoContent), 0600); err != nil {
		_ = os.RemoveAll(ksDir)
		return nil, fmt.Errorf("failed to write info.txt: %w", err)
	}

	return &KeystoreDetails{
		ID:            id,
		Alias:         alias,
		StorePassword: storePass,
		KeyPassword:   keyPass,
		FilePath:      ksPath,
		InfoPath:      infoPath,
		CreatedAt:     time.Now(),
		IsGenerated:   true,
	}, nil
}

func (m *Manager) SaveUploadedKeystore(reader io.Reader, originalFilename string) (string, string, error) {
	id := generateID()
	ksDir := filepath.Join(m.baseDir, id)
	if err := os.MkdirAll(ksDir, 0700); err != nil {
		return "", "", fmt.Errorf("failed to create keystore folder: %w", err)
	}

	ext := filepath.Ext(originalFilename)
	if ext != ".jks" && ext != ".keystore" {
		ext = ".jks"
	}
	targetPath := filepath.Join(ksDir, "uploaded"+ext)

	dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		_ = os.RemoveAll(ksDir)
		return "", "", fmt.Errorf("failed to open destination file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, reader); err != nil {
		_ = os.RemoveAll(ksDir)
		return "", "", fmt.Errorf("failed to save uploaded keystore: %w", err)
	}

	_ = os.Chmod(targetPath, 0600)
	return id, targetPath, nil
}

func (m *Manager) GetKeystorePath(id string) (string, error) {
	cleanID := filepath.Base(id)
	ksDir := filepath.Join(m.baseDir, cleanID)

	entries, err := os.ReadDir(ksDir)
	if err != nil {
		return "", fmt.Errorf("keystore not found: %w", err)
	}

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasSuffix(name, ".keystore") || strings.HasSuffix(name, ".jks") {
			return filepath.Join(ksDir, name), nil
		}
	}

	return "", errors.New("keystore file not found in folder")
}

func (m *Manager) GetInfoPath(id string) (string, error) {
	cleanID := filepath.Base(id)
	infoPath := filepath.Join(m.baseDir, cleanID, "info.txt")
	if _, err := os.Stat(infoPath); err != nil {
		return "", fmt.Errorf("info file not found: %w", err)
	}
	return infoPath, nil
}

func (m *Manager) DeleteKeystore(id string) error {
	cleanID := filepath.Base(id)
	if cleanID == "" || cleanID == "." || cleanID == "/" {
		return errors.New("invalid id")
	}
	ksDir := filepath.Join(m.baseDir, cleanID)
	return os.RemoveAll(ksDir)
}

