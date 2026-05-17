#!/usr/bin/env node

const http = require('http')
const fs = require('fs')
const path = require('path')
const localAddon = require('..')

const port = Number(process.env.PORT || 1222)
const host = process.env.HOST || '0.0.0.0'
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://192.168.3.20:${port}`).replace(/\/$/, '')

console.log('[stremio-local-addon] Starting...')
console.log(`[stremio-local-addon] Bind address: ${host}:${port}`)
console.log(`[stremio-local-addon] Public base URL: ${publicBaseUrl}`)
console.log(`[stremio-local-addon] Manifest URL: ${publicBaseUrl}/manifest.json`)
console.log('[stremio-local-addon] Index file: ./localFiles')
console.log(`[stremio-local-addon] HOME scan root: ${process.env.HOME || '(not set)'}`)

// Patch HTTP server creation so we can:
// 1. log requests/responses
// 2. serve mounted media files over HTTP from /media/...
const originalCreateServer = http.createServer

http.createServer = function patchedCreateServer(requestListener) {
  const wrappedListener = function wrappedRequestListener(req, res) {
    const startedAt = Date.now()
    const requestUrl = req.url || '/'

    console.log(`[request] ${req.method} ${requestUrl}`)

    res.on('finish', () => {
      const duration = Date.now() - startedAt
      console.log(`[response] ${req.method} ${requestUrl} ${res.statusCode} ${duration}ms`)
    })

    if (requestUrl.startsWith('/media/')) {
      return serveMediaFile(req, res, requestUrl)
    }

    return requestListener(req, res)
  }

  return originalCreateServer.call(http, wrappedListener)
}

function serveMediaFile(req, res, requestUrl) {
  let decodedPath

  try {
    decodedPath = decodeURIComponent(requestUrl.split('?')[0])
  } catch (err) {
    res.writeHead(400)
    return res.end('Bad request')
  }

  const filePath = path.normalize(decodedPath)

  // Security guard: only serve files inside /media
  if (!filePath.startsWith('/media/')) {
    res.writeHead(403)
    return res.end('Forbidden')
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404)
      return res.end('Not found')
    }

    const contentType = getContentType(filePath)
    const range = req.headers.range

    if (range) {
      return serveRange(req, res, filePath, stat, contentType, range)
    }

    res.writeHead(200, {
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType
    })

    fs.createReadStream(filePath).pipe(res)
  })
}

function serveRange(req, res, filePath, stat, contentType, range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)

  if (!match) {
    res.writeHead(416, {
      'Content-Range': `bytes */${stat.size}`
    })
    return res.end()
  }

  let start = match[1] === '' ? 0 : Number(match[1])
  let end = match[2] === '' ? stat.size - 1 : Number(match[2])

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start > end ||
    start >= stat.size
  ) {
    res.writeHead(416, {
      'Content-Range': `bytes */${stat.size}`
    })
    return res.end()
  }

  end = Math.min(end, stat.size - 1)

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': contentType
  })

  fs.createReadStream(filePath, { start, end }).pipe(res)
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()

  switch (ext) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.mkv':
      return 'video/x-matroska'
    case '.avi':
      return 'video/x-msvideo'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.srt':
      return 'application/x-subrip'
    case '.vtt':
      return 'text/vtt'
    default:
      return 'application/octet-stream'
  }
}

try {
  localAddon.addon().runHTTPWithOptions({
    port,
    host
  })

  console.log(`[stremio-local-addon] HTTP addon accessible at: ${publicBaseUrl}/manifest.json`)
} catch (err) {
  console.error('[stremio-local-addon] Failed to start HTTP server:', err)
  process.exit(1)
}

const reindexIntervalMs = Number(process.env.REINDEX_INTERVAL_MS || 10 * 60 * 1000)

function runIndexer() {
  try {
    console.log(`[stremio-local-addon] Starting indexing at ${new Date().toISOString()}...`)
    localAddon.startIndexing('./localFiles')
    console.log('[stremio-local-addon] Indexing started')
  } catch (err) {
    console.error('[stremio-local-addon] Failed to start indexing:', err)
  }
}

// First run immediately
runIndexer()

// Then force reindex every 10 minutes
setInterval(() => {
  console.log('[stremio-local-addon] Forcing scheduled reindex...')
  runIndexer()
}, reindexIntervalMs)
