export const DASHBOARD_ROUTE = '/_dsh/harbor-evolution/dashboard'
export const JOB_ROUTE = '/_dsh/harbor-evolution/job'
export const TRIALS_ROUTE = '/_dsh/harbor-evolution/trials'
export const TRIAL_ROUTE = '/_dsh/harbor-evolution/trial'

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
    return address === '::1' || address === '127.0.0.1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
  }
  const host = request.headers.host
  if (!host) return false
  try {
    const parsed = new URL(origin)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === host
  } catch {
    return false
  }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/(?:\/[A-Za-z0-9._ -]+){2,}/g, '[local path]').replace(/[A-Za-z]:\\[^\s]+/g, '[local path]')
}

export function createApiHandler(load, code = 'request-failed') {
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
    const url = new URL(request.url ?? '/', 'http://localhost')
    const args = Object.fromEntries(url.searchParams)
    Promise.resolve(load(args)).then(
      value => sendJson(response, 200, { ok: true, value }),
      error => sendJson(response, 500, { ok: false, error: { code, message: safeError(error) } }),
    )
  }
}

export function createDashboardHandler(service) {
  return createApiHandler(() => service.dashboard(), 'dashboard-unavailable')
}

export function installDashboardWeb(ctx, service) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['webServer'], (webCtx) => {
    const routes = [
      [DASHBOARD_ROUTE, createDashboardHandler(service)],
      [JOB_ROUTE, createApiHandler(args => service.job(args), 'job-unavailable')],
      [TRIALS_ROUTE, createApiHandler(args => service.trials(args), 'trials-unavailable')],
      [TRIAL_ROUTE, createApiHandler(args => service.trial(args), 'trial-unavailable')],
    ]
    for (const [route, handler] of routes) {
      webCtx.effect(() => webCtx.webServer.register({ kind: 'exact', path: route, handler }), `harbor-evolution: ${route}`)
    }
  })
}
