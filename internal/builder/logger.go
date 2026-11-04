package builder

import (
	"sync"
)

const DefaultMaxLogLines = 5000

type BuildLogger struct {
	mu          sync.RWMutex
	lines       []string
	maxLines    int
	subscribers map[chan string]struct{}
	masker      *Masker
}

func NewBuildLogger(maxLines int, masker *Masker) *BuildLogger {
	if maxLines <= 0 {
		maxLines = DefaultMaxLogLines
	}
	return &BuildLogger{
		lines:       make([]string, 0, 1000),
		maxLines:    maxLines,
		subscribers: make(map[chan string]struct{}),
		masker:      masker,
	}
}

func (bl *BuildLogger) Append(rawLine string) {
	masked := bl.masker.Mask(rawLine)

	bl.mu.Lock()
	if len(bl.lines) >= bl.maxLines {
		// Drop oldest line
		copy(bl.lines, bl.lines[1:])
		bl.lines[len(bl.lines)-1] = masked
	} else {
		bl.lines = append(bl.lines, masked)
	}

	// Fan out to active subscribers
	for ch := range bl.subscribers {
		select {
		case ch <- masked:
		default:
			// Client channel full or slow, skip to prevent blocking the build pipeline
		}
	}
	bl.mu.Unlock()
}

func (bl *BuildLogger) GetHistory() []string {
	bl.mu.RLock()
	defer bl.mu.RUnlock()

	res := make([]string, len(bl.lines))
	copy(res, bl.lines)
	return res
}

func (bl *BuildLogger) Subscribe() (chan string, func()) {
	bl.mu.Lock()
	ch := make(chan string, 200)
	bl.subscribers[ch] = struct{}{}
	bl.mu.Unlock()

	unsubscribe := func() {
		bl.mu.Lock()
		delete(bl.subscribers, ch)
		close(ch)
		bl.mu.Unlock()
	}

	return ch, unsubscribe
}

func (bl *BuildLogger) Clear() {
	bl.mu.Lock()
	defer bl.mu.Unlock()
	bl.lines = bl.lines[:0]
}

