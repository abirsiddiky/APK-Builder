package api

import (
	"net/http"
	"strings"

	"apkbuilder/internal/auth"

	"github.com/gin-gonic/gin"
)

type Middleware struct {
	tokenManager *auth.TokenManager
	rateLimiter  *auth.RateLimiter
	sysTracker   *SystemTracker
}

func NewMiddleware(tm *auth.TokenManager, rl *auth.RateLimiter, st *SystemTracker) *Middleware {
	return &Middleware{
		tokenManager: tm,
		rateLimiter:  rl,
		sysTracker:   st,
	}
}

// ActivityTracker records timestamps of user requests to track idle time
func (m *Middleware) ActivityTracker() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only track API requests
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			m.sysTracker.RecordActivity()
		}
		c.Next()
	}
}

// RequireAuth ensures a valid Bearer token or query parameter token is present
func (m *Middleware) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := ""

		// 1. Authorization header: "Bearer <token>"
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
				token = strings.TrimSpace(parts[1])
			}
		}

		// 2. Query param fallback for SSE or direct file downloads: ?token=<token>
		if token == "" {
			token = strings.TrimSpace(c.Query("token"))
		}

		if token == "" || !m.tokenManager.Validate(token) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Unauthorized: valid Bearer token required",
			})
			return
		}

		c.Next()
	}
}

// RateLimitLogin prevents brute-force login attempts
func (m *Middleware) RateLimitLogin() gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		blocked, waitTime := m.rateLimiter.IsBlocked(clientIP)
		if blocked {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":     "Too many failed login attempts. Please try again later.",
				"wait_secs": int(waitTime.Seconds()),
			})
			return
		}
		c.Next()
	}
}

// CORSMiddleware handles cross-origin requests gracefully for local dev
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

