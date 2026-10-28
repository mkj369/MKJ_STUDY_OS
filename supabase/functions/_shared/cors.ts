// Shared CORS headers for Edge Functions.
// Tighten ALLOW_ORIGIN in production (e.g. https://your-app.pages.dev and the
// Capacitor scheme) instead of using "*".
const configured = Deno.env.get('ALLOW_ORIGIN') ?? '*';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': configured,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}
