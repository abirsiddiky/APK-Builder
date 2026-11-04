package api

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
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

// getHostUptimeSeconds reads true server uptime from /proc/uptime on Linux VPS
func getHostUptimeSeconds() (int64, error) {
	if runtime.GOOS != "linux" {
		return 0, errors.New("not linux")
	}
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0, err
	}
	fields := strings.Fields(string(data))
	if len(fields) == 0 {
		return 0, errors.New("empty /proc/uptime")
	}
	sec, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, err
	}
	return int64(sec), nil
}

func (st *SystemTracker) GetStatus(runner *builder.Runner) gin.H {
	st.mu.Lock()
	defer st.mu.Unlock()

	now := time.Now()
	processUptimeSecs := int64(now.Sub(st.startTime).Seconds())
	uptimeSecs := processUptimeSecs

	// On Linux VPS, retrieve actual host machine uptime from /proc/uptime
	if hostUptime, err := getHostUptimeSeconds(); err == nil && hostUptime > 0 {
		uptimeSecs = hostUptime
	}

	buildStatus := runner.GetStatus()

	// If build is actively running, keep lastActivity fresh and ensure uptime >= build duration
	if buildStatus.Status == "cloning" || buildStatus.Status == "building" || buildStatus.Status == "signing" {
		st.lastActivity = now
		if buildStatus.DurationSeconds > uptimeSecs {
			uptimeSecs = buildStatus.DurationSeconds
		}
	}

	idleSecs := int64(now.Sub(st.lastActivity).Seconds())
	if idleSecs < 0 {
		idleSecs = 0
	}
	idleMin := idleSecs / 60
	isIdleWarning := idleMin >= int64(st.idleLimitMin)

	uptimeFormatted := formatDuration(time.Duration(uptimeSecs) * time.Second)

	return gin.H{
		"server_start_time":      st.startTime.Format(time.RFC3339),
		"uptime_seconds":         uptimeSecs,
		"uptime_formatted":       uptimeFormatted,
		"process_uptime_seconds": processUptimeSecs,
		"last_activity":          st.lastActivity.Format(time.RFC3339),
		"idle_seconds":           idleSecs,
		"idle_minutes":           idleMin,
		"idle_limit_mins":        st.idleLimitMin,
		"is_idle_warning":        isIdleWarning,
		"build":                  buildStatus,
	}
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Minute)
	totalMinutes := int64(d.Minutes())
	if totalMinutes < 1 {
		return "1 min"
	}
	days := totalMinutes / (24 * 60)
	remMins := totalMinutes % (24 * 60)
	hours := remMins / 60
	mins := remMins % 60

	if days > 0 {
		if mins > 0 {
			return fmt.Sprintf("%dd %dh %dm", days, hours, mins)
		}
		return fmt.Sprintf("%dd %dh", days, hours)
	}
	if hours > 0 {
		if mins > 0 {
			return fmt.Sprintf("%d hr %d min", hours, mins)
		}
		return fmt.Sprintf("%d hr", hours)
	}
	return fmt.Sprintf("%d min", mins)
}

func (h *Handlers) HandleSystemStatus(c *gin.Context) {
	status := h.sysTracker.GetStatus(h.runner)
	c.JSON(http.StatusOK, status)
}
