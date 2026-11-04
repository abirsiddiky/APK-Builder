package auth

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTokenManager_EnvToken(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "token-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	envToken := "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff"

	// 1. First run with environment token
	tm1, err := NewTokenManager(tempDir, envToken)
	if err != nil {
		t.Fatalf("NewTokenManager failed: %v", err)
	}

	if !tm1.Validate(envToken) {
		t.Errorf("expected token to validate successfully")
	}
	if tm1.Validate("invalid-token") {
		t.Errorf("expected invalid token to be rejected")
	}

	hashFile := filepath.Join(tempDir, "admin.token.hash")
	if _, err := os.Stat(hashFile); os.IsNotExist(err) {
		t.Fatalf("expected admin.token.hash to exist on disk")
	}

	// 2. Second run: should keep existing hash from disk
	tm2, err := NewTokenManager(tempDir, "different-token-in-env")
	if err != nil {
		t.Fatalf("NewTokenManager second run failed: %v", err)
	}

	// Original envToken should still validate because disk hash was kept
	if !tm2.Validate(envToken) {
		t.Errorf("expected original token to validate from preserved disk hash")
	}
	if tm2.Validate("different-token-in-env") {
		t.Errorf("expected new env token to NOT validate because existing hash was kept")
	}
}

func TestTokenManager_RandomFallback(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "token-test-random-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// First run without environment token
	tm, err := NewTokenManager(tempDir, "")
	if err != nil {
		t.Fatalf("NewTokenManager failed: %v", err)
	}

	if tm.tokenHash == "" {
		t.Errorf("expected generated token hash to be non-empty")
	}
}

