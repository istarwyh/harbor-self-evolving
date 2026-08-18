export const DASHBOARD_ROUTE = '/_dsh/harbor-evolution/dashboard'

function sendJson(response, status, body) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

export function isSameOriginRequest(request) {
  const fetchSite = request.headers['sec-fetch-site']
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false
  const origin = request.headers.origin
  if (!origin) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') return true
    const address = request.socket?.remoteAddress ?? ''
    return address === '::1' || address === '127.0.0.1' || address.startsWith('127.')
      || address.startsWith('::ffff:127.')
  }
  const host = request.headers.host
  if (!host) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

export function createDashboardHandler(service) {
  return (request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' })
      response.end()
      return
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin request required' } })
      return
    }
    Promise.resolve(service.dashboard()).then(
      value => sendJson(response, 200, { ok: true, value }),
      error => sendJson(response, 500, {
        ok: false,
        error: { code: 'dashboard-unavailable', message: error instanceof Error ? error.message : String(error) },
      }),
    )
  }
}

/** Add the dashboard route only in profiles that provide the optional Web service. */
export function installDashboardWeb(ctx, service) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: DASHBOARD_ROUTE,
      handler: createDashboardHandler(service),
    }), 'harbor-evolution: dashboard route')
  })
}
