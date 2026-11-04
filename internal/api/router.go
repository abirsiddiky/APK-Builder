package api

import (
	"net/http"
	"strings"

	"apkbuilder/internal/auth"
	"apkbuilder/internal/builder"
	"apkbuilder/internal/keystore"
	"apkbuilder/web"

	"github.com/gin-gonic/gin"
)

type Handlers struct {
	tokenManager *auth.TokenManager
	rateLimiter  *auth.RateLimiter
	keystoreMgr  *keystore.Manager
	runner       *builder.Runner
	sysTracker   *SystemTracker
}

func SetupRouter(
	tm *auth.TokenManager,
	rl *auth.RateLimiter,
	km *keystore.Manager,
	runner *builder.Runner,
	st *SystemTracker,
) (*gin.Engine, error) {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(CORSMiddleware())

	middleware := NewMiddleware(tm, rl, st)
	r.Use(middleware.ActivityTracker())

	handlers := &Handlers{
		tokenManager: tm,
		rateLimiter:  rl,
		keystoreMgr:  km,
		runner:       runner,
		sysTracker:   st,
	}

	// API Routes
	apiGroup := r.Group("/api")
	{
		// Public route for login (protected by rate limiter)
		apiGroup.POST("/auth/login", middleware.RateLimitLogin(), handlers.HandleLogin)

		// Protected routes requiring valid admin token
		protected := apiGroup.Group("/")
		protected.Use(middleware.RequireAuth())
		{
			// Auth
			protected.GET("/auth/check", handlers.HandleAuthCheck)

			// System Status
			protected.GET("/system/status", handlers.HandleSystemStatus)

			// Keystore
			protected.POST("/keystore/generate", handlers.HandleKeystoreGenerate)
			protected.GET("/keystore/download/:id", handlers.HandleKeystoreDownload)
			protected.GET("/keystore/info/:id", handlers.HandleKeystoreInfo)
			protected.POST("/keystore/upload", handlers.HandleKeystoreUpload)

			// Build
			protected.POST("/build/start", handlers.HandleBuildStart)
			protected.GET("/build/status", handlers.HandleBuildStatus)
			protected.GET("/build/logs", handlers.HandleBuildLogsSSE)
			protected.POST("/build/cancel", handlers.HandleBuildCancel)
			protected.GET("/build/download", handlers.HandleBuildDownload)
			protected.POST("/build/cleanup", handlers.HandleBuildCleanup)
		}
	}

	// Static SPA Serving
	indexBytes, err := web.GetIndexHTML()
	if err != nil {
		indexBytes = []byte("<html><body><h1>APK Builder</h1></body></html>")
	}

	staticFS, err := web.GetStaticFileSystem()
	if err != nil {
		return nil, err
	}

	// Root path serves index.html directly
	r.GET("/", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexBytes)
	})

	// Fallback for HTML5 pushState routing & static assets
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		if strings.HasPrefix(path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "Endpoint not found"})
			return
		}

		cleanPath := strings.TrimPrefix(path, "/")
		if cleanPath != "" && cleanPath != "index.html" {
			if f, err := staticFS.Open(cleanPath); err == nil {
				_ = f.Close()
				c.FileFromFS(cleanPath, staticFS)
				return
			}
		}

		// Serve SPA shell for all client routes (e.g. /login, /build, /settings)
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexBytes)
	})

	return r, nil
}
