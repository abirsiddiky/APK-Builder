package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type LoginRequest struct {
	Token string `json:"token" binding:"required"`
}

func (h *Handlers) HandleLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Admin token is required"})
		return
	}

	token := strings.TrimSpace(req.Token)
	clientIP := c.ClientIP()

	if !h.tokenManager.Validate(token) {
		h.rateLimiter.RecordFailed(clientIP)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid admin access token"})
		return
	}

	h.rateLimiter.RecordSuccess(clientIP)
	h.sysTracker.RecordActivity()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"token":   token,
		"message": "Authenticated successfully",
	})
}

func (h *Handlers) HandleAuthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"authenticated": true,
	})
}

