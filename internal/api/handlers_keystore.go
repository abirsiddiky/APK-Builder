package api

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"apkbuilder/internal/keystore"

	"github.com/gin-gonic/gin"
)

func (h *Handlers) HandleKeystoreGenerate(c *gin.Context) {
	var req keystore.GenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid keystore parameters: " + err.Error()})
		return
	}

	details, err := h.keystoreMgr.Generate(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           details.ID,
		"alias":        details.Alias,
		"download_url": fmt.Sprintf("/api/keystore/download/%s", details.ID),
		"info_url":     fmt.Sprintf("/api/keystore/info/%s", details.ID),
		"message":      "Keystore successfully generated",
		"warning":      "If you lose this keystore you can never update your app on Play Store. Back it up immediately.",
	})
}

func (h *Handlers) HandleKeystoreDownload(c *gin.Context) {
	id := c.Param("id")
	if strings.TrimSpace(id) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing keystore ID"})
		return
	}

	ksPath, err := h.keystoreMgr.GetKeystorePath(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	filename := filepath.Base(ksPath)
	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	c.File(ksPath)
}

func (h *Handlers) HandleKeystoreInfo(c *gin.Context) {
	id := c.Param("id")
	if strings.TrimSpace(id) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing keystore ID"})
		return
	}

	infoPath, err := h.keystoreMgr.GetInfoPath(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=\"info.txt\"")
	c.File(infoPath)
}

func (h *Handlers) HandleKeystoreUpload(c *gin.Context) {
	file, err := c.FormFile("keystore")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File upload 'keystore' is required: " + err.Error()})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".jks" && ext != ".keystore" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only .jks and .keystore files are accepted"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read uploaded file"})
		return
	}
	defer src.Close()

	id, savedPath, err := h.keystoreMgr.SaveUploadedKeystore(src, file.Filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save keystore: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       id,
		"filename": filepath.Base(savedPath),
		"message":  "Keystore successfully uploaded",
	})
}

