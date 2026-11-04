package api

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"apkbuilder/internal/builder"

	"github.com/gin-gonic/gin"
)

type SystemTracker struct {
	mu           sync.RWMutex
	startTime    time.Time
	lastActivity time.Time
	idleLimitMin int
}

func NewSystemTracker(idleLimitMin int) *SystemTracker {
	now := time.Now()
	if idleLimitMin <= 0 {
		idleLimitMin = 60
	}
	return &SystemTracker{
		startTime:    now,
		lastActivity: now,
		idleLimitMin: idleLimitMin,
	}
}

func (st *SystemTracker) RecordActivity() {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.lastActivity = time.Now()
}

func (st *SystemTracker) GetStatus(runner *builder.Runner) gin.H {
	st.mu.RLock()
	defer st.mu.RUnlock()

	now := time.Now()
	uptimeSecs := int64(now.Sub(st.startTime).Seconds())
	idleSecs := int64(now.Sub(st.lastActivity).Seconds())
	idleMin := idleSecs / 60
	isIdleWarning := idleMin >= int64(st.idleLimitMin)

	uptimeFormatted := formatDuration(time.Duration(uptimeSecs) * time.Second)

	buildStatus := runner.GetStatus()

	return gin.H{
		"server_start_time": st.startTime.Format(time.RFC3339),
		"uptime_seconds":    uptimeSecs,
		"uptime_formatted":  uptimeFormatted,
		"last_activity":     st.lastActivity.Format(time.RFC3339),
		"idle_seconds":      idleSecs,
		"idle_minutes":      idleMin,
		"idle_limit_mins":   st.idleLimitMin,
		"is_idle_warning":   isIdleWarning,
		"build":             buildStatus,
	}
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Minute)
	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute

	if h > 0 {
		return fmt.Sprintf("%d hr %d min", h, m)
	}
	return fmt.Sprintf("%d min", m)
}

func (h *Handlers) HandleSystemStatus(c *gin.Context) {
	status := h.sysTracker.GetStatus(h.runner)
	c.JSON(http.StatusOK, status)
}

