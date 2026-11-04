package web

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:dist
var distFS embed.FS

// GetStaticFileSystem returns the http.FileSystem pointing to the embedded dist directory
func GetStaticFileSystem() (http.FileSystem, error) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return nil, err
	}
	return http.FS(sub), nil
}

// GetIndexHTML returns the raw bytes of index.html
func GetIndexHTML() ([]byte, error) {
	return distFS.ReadFile("dist/index.html")
}
