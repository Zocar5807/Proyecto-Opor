#!/usr/bin/env node

/**
 * Servidor simple para servir el frontend estático
 * Alternativa a usar Apache/XAMPP
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.FRONTEND_PORT || 8080;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const PUBLIC_DIR = path.join(FRONTEND_DIR, 'public');
const ASSETS_DIR = path.join(FRONTEND_DIR, 'assets');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;

  // Normalizar la ruta (remover .. y .)
  pathname = path.normalize(pathname).replace(/\\/g, '/');
  
  // Si es la raíz, servir index.html
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  let filePath;
  
  // Si la ruta empieza con /assets/, servir desde frontend/assets
  if (pathname.startsWith('/assets/')) {
    // Remover el prefijo /assets/ y construir la ruta
    const assetPath = pathname.substring(8); // Remover '/assets/'
    // Normalizar y prevenir path traversal
    const normalizedPath = path.normalize(assetPath).replace(/\\/g, '/');
    if (normalizedPath.startsWith('..')) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('<h1>403 - Acceso denegado</h1>', 'utf-8');
      return;
    }
    filePath = path.join(ASSETS_DIR, normalizedPath);
  } else {
    // De lo contrario, servir desde frontend/public
    // Normalizar y prevenir path traversal
    const normalizedPath = path.normalize(pathname).replace(/\\/g, '/');
    if (normalizedPath.startsWith('..')) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('<h1>403 - Acceso denegado</h1>', 'utf-8');
      return;
    }
    filePath = path.join(PUBLIC_DIR, normalizedPath);
  }

  // Verificar que el archivo existe y está dentro del directorio permitido
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 - Acceso denegado</h1>', 'utf-8');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.error(`404: ${pathname} -> ${filePath}`);
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`<h1>404 - Página no encontrada</h1><p>Ruta: ${pathname}</p>`, 'utf-8');
      } else {
        console.error(`Error leyendo archivo: ${err.message}`);
        res.writeHead(500);
        res.end(`Error del servidor: ${err.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🌐 Servidor frontend iniciado en http://localhost:${PORT}`);
  console.log(`📁 Sirviendo archivos desde: ${FRONTEND_DIR}\n`);
});










