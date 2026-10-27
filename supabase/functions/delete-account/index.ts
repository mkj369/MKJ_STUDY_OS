/**
 * delete-account Edge Function
 *
 * Permanently deletes the authenticated user's auth record. Every owned row is
 * removed by `on delete cascade` foreign keys (profiles, subjects, records,
 * notes, reminders, audit rows). Requires the service-role key, which exists
 * only inside this function's environment.
 *
 * Body: { confirm: "DELETE" }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 'Use POST.', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('unauthenticated', 'Missing Authorization header.', 401);

  let body: { confirm?: string };
  try {
    body = (await req.json()) as { confirm?: string };
  } catch {
    return errorResponse('invalid_request', 'Body must be JSON.', 400);
  }
  if (body.confirm !== 'DELETE') {
    return errorResponse('invalid_request', 'Send { "confirm": "DELETE" } to confirm.', 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return errorResponse('not_configured', 'Server keys are incomplete; deletion is disabled.', 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return errorResponse('unauthenticated', 'Sign in again to delete your account.', 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    console.error('delete-account failed', deleteError.message);
    return errorResponse('delete_failed', 'The account could not be deleted. Try again or contact support.', 500);
  }

  return jsonResponse({ deleted: true });
});
