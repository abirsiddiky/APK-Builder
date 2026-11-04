package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"apkbuilder/internal/builder"

	"github.com/gin-gonic/gin"
)

func (h *Handlers) HandleBuildStart(c *gin.Context) {
	var req builder.BuildRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	var keystorePath string
	if req.BuildType == "release" {
		if req.KeystoreID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Keystore ID is required for signed release builds"})
			return
		}
		var err error
		keystorePath, err = h.keystoreMgr.GetKeystorePath(req.KeystoreID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid keystore: " + err.Error()})
			return
		}
	}

	if err := h.runner.StartBuild(&req, keystorePath); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Build started successfully",
		"status":  h.runner.GetStatus(),
	})
}

func (h *Handlers) HandleBuildStatus(c *gin.Context) {
	status := h.runner.GetStatus()
	c.JSON(http.StatusOK, status)
}

func (h *Handlers) HandleBuildCancel(c *gin.Context) {
	if err := h.runner.Cancel(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Build cancellation issued",
		"status":  h.runner.GetStatus(),
	})
}

func (h *Handlers) HandleBuildLogsSSE(c *gin.Context) {
	w := c.Writer
	r := c.Request

	// Ensure headers for Server-Sent Events
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Flush()

	logger := h.runner.GetLogger()

	// 1. Replay initial history (up to last 5000 lines) so refreshing reloads log
	history := logger.GetHistory()
	if history == nil {
		history = []string{}
	}
	historyPayload, _ := json.Marshal(history)
	fmt.Fprintf(w, "event: init\ndata: %s\n\n", string(historyPayload))
	w.Flush()

	// 2. Subscribe to live log streaming
	logCh, unsubscribe := logger.Subscribe()
	defer unsubscribe()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			// Client disconnected
			return

		case <-heartbeat.C:
			// Send SSE comment heartbeat to prevent reverse proxies / browser from timing out
			fmt.Fprintf(w, ": heartbeat\n\n")
			w.Flush()

		case line, ok := <-logCh:
			if !ok {
				return
			}
			// Send message event with log line
			// JSON encode data so newline and special characters are preserved safely
			lineJSON, _ := json.Marshal(line)
			fmt.Fprintf(w, "event: log\ndata: %s\n\n", string(lineJSON))
			w.Flush()
		}
	}
}

func (h *Handlers) HandleBuildDownload(c *gin.Context) {
	apkPath, originalName, err := h.runner.GetOutputApk()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	if originalName == "" {
		originalName = "app.apk"
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Type", "application/vnd.android.package-archive")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", originalName))
	c.File(apkPath)
}

func (h *Handlers) HandleBuildCleanup(c *gin.Context) {
	if err := h.runner.CleanupCurrent(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clean up: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Temporary build files and artifacts successfully cleaned up",
	})
}

