package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/crypto/bcrypt"
)

type TokenManager struct {
	mu        sync.RWMutex
	hashFile  string
	tokenHash string
}

func NewTokenManager(dataDir string, tokenOverride string) (*TokenManager, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	hashPath := filepath.Join(dataDir, "admin.token.hash")
	tm := &TokenManager{
		hashFile: hashPath,
	}

	// Case 1: Manual override via environment variable
	if strings.TrimSpace(tokenOverride) != "" {
		token := strings.TrimSpace(tokenOverride)
		hash, err := bcrypt.GenerateFromPassword([]byte(token), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("failed to hash token override: %w", err)
		}
		if err := os.WriteFile(hashPath, hash, 0600); err != nil {
			return nil, fmt.Errorf("failed to save token hash: %w", err)
		}
		tm.tokenHash = string(hash)
		printTokenBanner(token, true)
		return tm, nil
	}

	// Case 2: Read existing hash from disk
	if data, err := os.ReadFile(hashPath); err == nil && len(data) > 0 {
		tm.tokenHash = strings.TrimSpace(string(data))
		fmt.Printf("[Auth] Loaded admin token hash from %s\n", hashPath)
		return tm, nil
	}

	// Case 3: First run - generate new random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, fmt.Errorf("failed to generate random token: %w", err)
	}
	rawToken := hex.EncodeToString(tokenBytes)

	hash, err := bcrypt.GenerateFromPassword([]byte(rawToken), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash generated token: %w", err)
	}

	if err := os.WriteFile(hashPath, hash, 0600); err != nil {
		return nil, fmt.Errorf("failed to write token hash file: %w", err)
	}

	tm.tokenHash = string(hash)
	printTokenBanner(rawToken, false)

	return tm, nil
}

func (tm *TokenManager) Validate(candidate string) bool {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	trimmed := strings.TrimSpace(candidate)
	if trimmed == "" || tm.tokenHash == "" {
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(tm.tokenHash), []byte(trimmed))
	return err == nil
}

func printTokenBanner(token string, isOverride bool) {
	fmt.Println()
	fmt.Println("================================================================================")
	if isOverride {
		fmt.Println("                APK BUILDER - ADMIN TOKEN (ENVIRONMENT OVERRIDE)                ")
	} else {
		fmt.Println("                   APK BUILDER - INITIAL ADMIN ACCESS TOKEN                     ")
	}
	fmt.Println("================================================================================")
	fmt.Println("  Use this Bearer token to log in or access the APK Builder API:")
	fmt.Println()
	fmt.Printf("  %s\n", token)
	fmt.Println()
	fmt.Println("  Store this token safely. It is required to log into the web interface")
	fmt.Println("  and execute builds. Only the hash is persisted on disk.")
	fmt.Println("================================================================================")
	fmt.Println()
}

