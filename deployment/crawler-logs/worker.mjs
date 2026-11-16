// Attach as a Worker Route in front of the existing GitHub Pages origin.
// User-Agent is a claim, not proof of crawler identity. Verify the recorded IP.
export async function handleRequest(request, fetchOrigin = fetch, log = console.log) {
  const userAgent = request.headers.get('user-agent') || '';
  const record = /\bOAI-SearchBot\b/i.test(userAgent) ? {
    event: 'oai_searchbot_request',
    timestamp: new Date().toISOString(),
    path: new URL(request.url).pathname,
    method: request.method,
    userAgent: userAgent.slice(0, 2048),
    ip: request.headers.get('cf-connecting-ip'),
    rayId: request.headers.get('cf-ray'),
    identityVerified: false,
  } : null;
  const started = Date.now();
  // Logging must never prevent the origin response from reaching the visitor.
  const emit = fields => { try { log(JSON.stringify({ ...record, ...fields, durationMs: Date.now() - started })); } catch {} };
  try {
    const response = await fetchOrigin(request);
    if (record) emit({ status: response.status });
    return response;
  } catch (error) {
    if (record) emit({ status: null, originError: true });
    throw error;
  }
}

export default { fetch(request) { return handleRequest(request); } };
