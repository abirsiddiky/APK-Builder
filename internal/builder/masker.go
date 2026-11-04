package builder

import (
	"regexp"
	"strings"
	"sync"
)

var (
	urlCredentialRegex = regexp.MustCompile(`https?://[^:\s/]+:([^@\s]+)@`)
	githubTokenRegex   = regexp.MustCompile(`(ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{50,}|glpat-[a-zA-Z0-9\-_]{20,})`)
	passArgRegex       = regexp.MustCompile(`(?i)(--ks-pass|--key-pass|-PstorePassword|-PkeyPassword|pass:|storepass|keypass)\s*[:= ]\s*([^\s]+)`)
)

type Masker struct {
	mu      sync.RWMutex
	secrets []string
}

func NewMasker() *Masker {
	return &Masker{
		secrets: make([]string, 0),
	}
}

func (m *Masker) AddSecret(secret string) {
	trimmed := strings.TrimSpace(secret)
	if len(trimmed) < 4 {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.secrets {
		if s == trimmed {
			return
		}
	}
	m.secrets = append(m.secrets, trimmed)
}

func (m *Masker) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.secrets = m.secrets[:0]
}

func (m *Masker) Mask(text string) string {
	if text == "" {
		return text
	}

	result := text

	// 1. Mask explicit secrets
	m.mu.RLock()
	for _, secret := range m.secrets {
		if secret != "" {
			result = strings.ReplaceAll(result, secret, "********")
		}
	}
	m.mu.RUnlock()

	// 2. Mask embedded URL credentials: https://user:token@domain -> https://user:********@domain
	result = urlCredentialRegex.ReplaceAllString(result, "https://***:********@")

	// 3. Mask known git token patterns
	result = githubTokenRegex.ReplaceAllString(result, "********")

	// 4. Mask CLI password flags
	result = passArgRegex.ReplaceAllString(result, "$1=********")

	return result
}

