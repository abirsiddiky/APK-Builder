package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"apkbuilder/internal/api"
	"apkbuilder/internal/auth"
	"apkbuilder/internal/builder"
	"apkbuilder/internal/config"
	"apkbuilder/internal/keystore"
)

func main() {
	log.Println("[Main] Starting APK Builder Server...")

	cfg := config.Load()

	// Linux non-root security check
	if runtime.GOOS == "linux" && os.Geteuid() == 0 {
		log.Println("[Warning] Running as root! In production, run as non-root user 'builder' for security isolation.")
	}

	// Initialize Auth Token Manager
	tm, err := auth.NewTokenManager(cfg.DataDir, cfg.AdminTokenOverride)
	if err != nil {
		log.Fatalf("[Error] Failed to initialize token manager: %v", err)
	}

	// Initialize Rate Limiter: max 5 failed attempts per 1 min, blocked for 3 min
	rl := auth.NewRateLimiter(5, 1*time.Minute, 3*time.Minute)

	// Initialize Keystore Manager
	km, err := keystore.NewManager(cfg.DataDir, cfg.KeytoolBin)
	if err != nil {
		log.Fatalf("[Error] Failed to initialize keystore manager: %v", err)
	}

	// Initialize System Tracker
	st := api.NewSystemTracker(cfg.IdleWarningMinutes)

	// Initialize Build Runner
	runner, err := builder.NewRunner(cfg.DataDir, cfg.AndroidHome, cfg.FlutterHome, cfg.BuildTimeoutMinutes)
	if err != nil {
		log.Fatalf("[Error] Failed to initialize build runner: %v", err)
	}

	// Setup Router
	router, err := api.SetupRouter(tm, rl, km, runner, st)
	if err != nil {
		log.Fatalf("[Error] Failed to setup router: %v", err)
	}

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("[Server] APK Builder listening on http://0.0.0.0:%s\n", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Error] Server failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Server] Shutting down APK Builder server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[Error] Server forced to shutdown: %v\n", err)
	}

	fmt.Println("[Server] Shutdown complete.")
}

