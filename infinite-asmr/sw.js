// Service Worker — CORS proxy for DashScope APIs in production
// Registered from the same origin, so it can intercept and forward requests
// without triggering browser CORS checks.

const PROXY_MARKER = '__proxy'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only intercept proxy requests — pathname contains /__proxy/
  const markerIdx = url.pathname.indexOf('/' + PROXY_MARKER + '/')
  if (markerIdx === -1) {
    return
  }

  // Extract target URL from after /__proxy/
  const target = url.pathname.slice(markerIdx + PROXY_MARKER.length + 2) // skip "/__proxy/"
  // Accept any http/https URL (dashscope APIs + OSS audio files)
  if (!target || (!target.startsWith('https://') && !target.startsWith('http://'))) {
    return
  }

  // Reconstruct the original target URL with query string.
  // Upgrade http:// → https:// — the SW runs on an HTTPS origin and cannot
  // fetch() to plain HTTP (browser security restriction).
  let targetUrl = target + url.search
  if (targetUrl.startsWith('http://')) {
    targetUrl = 'https://' + targetUrl.slice(7)
  }

  event.respondWith(
    (async () => {
      try {
        const headers = new Headers(event.request.headers)
        headers.delete('Origin')
        headers.delete('Referer')

        const response = await fetch(targetUrl, {
          method: event.request.method,
          headers,
          body: event.request.body,
          duplex: 'half',
        })

        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-DashScope-OssResourceResolve, X-DashScope-Async',
        }

        const responseHeaders = new Headers(response.headers)
        for (const [key, value] of Object.entries(corsHeaders)) {
          responseHeaders.set(key, value)
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        })
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Proxy request failed', detail: e.message }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
    })()
  )
})
