import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate JWT for APNs authentication
async function generateAPNsJWT(): Promise<string> {
  const keyId = Deno.env.get('APNS_KEY_ID')!;
  const teamId = Deno.env.get('APNS_TEAM_ID')!;
  const privateKeyPem = Deno.env.get('APNS_PRIVATE_KEY')!;

  const header = {
    alg: 'ES256',
    kid: keyId,
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: teamId,
    iat: now,
  };

  // Base64url encode
  const base64url = (data: string) => 
    btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Parse PEM private key
  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import key for signing
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert signature to base64url
  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));

  return `${unsignedToken}.${signatureB64}`;
}

// Send push notification to a single device
async function sendPushToDevice(
  token: string, 
  title: string, 
  body: string, 
  jwt: string,
  bundleId: string,
  useSandbox: boolean = false
): Promise<{ success: boolean; error?: string }> {
  // Use sandbox for development builds, production for App Store builds
  const apnsHost = useSandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const url = `https://${apnsHost}/3/device/${token}`;
  
  console.log(`[PUSH] Sending to ${useSandbox ? 'SANDBOX' : 'PRODUCTION'}: ${url.substring(0, 60)}...`);

  const payload = {
    aps: {
      alert: {
        title,
        body,
      },
      sound: 'default',
      badge: 1,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwt}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`[PUSH] ✅ Success via ${useSandbox ? 'sandbox' : 'production'}`);
      return { success: true };
    } else {
      const errorText = await response.text();
      console.error(`[PUSH] APNs ${useSandbox ? 'sandbox' : 'prod'} error: ${response.status} - ${errorText}`);
      return { success: false, error: `${response.status}: ${errorText}` };
    }
  } catch (error) {
    console.error(`[PUSH] Failed to send:`, error);
    return { success: false, error: String(error) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { title, body, user_ids } = await req.json();

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: 'Title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[PUSH] Sending notification: "${title}"`);

    // Get push tokens for target users (or all users if not specified)
    let query = supabase.from('push_tokens').select('token, user_id');
    
    if (user_ids && user_ids.length > 0) {
      query = query.in('user_id', user_ids);
    }

    const { data: tokens, error: tokensError } = await query;

    if (tokensError) {
      console.error('[PUSH] Error fetching tokens:', tokensError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch push tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log('[PUSH] No push tokens found');
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No devices registered for push notifications' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[PUSH] Found ${tokens.length} push tokens`);

    // Generate APNs JWT
    const jwt = await generateAPNsJWT();
    const bundleId = 'com.birdiesbayside.hub';

    // Send to all tokens
    let successCount = 0;
    let failCount = 0;
    const invalidTokens: string[] = [];

    for (const { token } of tokens) {
      // Try production first, then sandbox if it fails
      let result = await sendPushToDevice(token, title, body, jwt, bundleId, false);
      
      // If production fails with BadDeviceToken, try sandbox (for dev builds)
      if (!result.success && result.error?.includes('BadDeviceToken')) {
        console.log(`[PUSH] Production failed, trying sandbox for token...`);
        result = await sendPushToDevice(token, title, body, jwt, bundleId, true);
        
        if (result.success) {
          console.log(`[PUSH] ✅ Sandbox worked for this token`);
          successCount++;
          continue;
        }
      }
      
      if (result.success) {
        successCount++;
      } else {
        failCount++;
        // Track invalid tokens to clean up (only if both prod and sandbox fail)
        if (result.error?.includes('BadDeviceToken') || result.error?.includes('Unregistered')) {
          invalidTokens.push(token);
        }
      }
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      console.log(`[PUSH] Removing ${invalidTokens.length} invalid tokens`);
      await supabase.from('push_tokens').delete().in('token', invalidTokens);
    }

    console.log(`[PUSH] Sent: ${successCount}, Failed: ${failCount}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount, 
        failed: failCount,
        cleaned: invalidTokens.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[PUSH] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
