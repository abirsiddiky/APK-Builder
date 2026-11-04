package auth

import (
	"sync"
	"time"
)

type RateLimiter struct {
	mu           sync.Mutex
	attempts     map[string][]time.Time
	maxAttempts  int
	window       time.Duration
	blockDuration time.Duration
	blockedUntil map[string]time.Time
}

func NewRateLimiter(maxAttempts int, window time.Duration, blockDuration time.Duration) *RateLimiter {
	rl := &RateLimiter{
		attempts:      make(map[string][]time.Time),
		maxAttempts:   maxAttempts,
		window:        window,
		blockDuration: blockDuration,
		blockedUntil:  make(map[string]time.Time),
	}

	// Background cleaner
	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		for range ticker.C {
			rl.cleanup()
		}
	}()

	return rl
}

func (rl *RateLimiter) IsBlocked(ip string) (bool, time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	// Check if explicitly blocked
	if until, exists := rl.blockedUntil[ip]; exists {
		if now.Before(until) {
			return true, until.Sub(now)
		}
		delete(rl.blockedUntil, ip)
	}

	// Filter attempts in current window
	attempts := rl.attempts[ip]
	validAttempts := make([]time.Time, 0, len(attempts))
	for _, t := range attempts {
		if now.Sub(t) <= rl.window {
			validAttempts = append(validAttempts, t)
		}
	}
	rl.attempts[ip] = validAttempts

	if len(validAttempts) >= rl.maxAttempts {
		rl.blockedUntil[ip] = now.Add(rl.blockDuration)
		return true, rl.blockDuration
	}

	return false, 0
}

func (rl *RateLimiter) RecordFailed(ip string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rl.attempts[ip] = append(rl.attempts[ip], now)

	if len(rl.attempts[ip]) >= rl.maxAttempts {
		rl.blockedUntil[ip] = now.Add(rl.blockDuration)
	}
}

func (rl *RateLimiter) RecordSuccess(ip string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	delete(rl.attempts, ip)
	delete(rl.blockedUntil, ip)
}

func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for ip, times := range rl.attempts {
		valid := make([]time.Time, 0, len(times))
		for _, t := range times {
			if now.Sub(t) <= rl.window {
				valid = append(valid, t)
			}
		}
		if len(valid) == 0 {
			delete(rl.attempts, ip)
		} else {
			rl.attempts[ip] = valid
		}
	}

	for ip, until := range rl.blockedUntil {
		if now.After(until) {
			delete(rl.blockedUntil, ip)
		}
	}
}

