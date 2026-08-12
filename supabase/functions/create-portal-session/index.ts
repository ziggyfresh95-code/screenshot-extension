// create-portal-session — Supabase Edge Function (Deno)
//
// Returns a Stripe Customer Portal URL for the signed-in user, where they can
// cancel their subscription, change payment method, or view invoices. Keep JWT
// verification ON for this function (the extension sends the user's token).
//
// Required function secrets: STRIPE_SECRET_KEY (already set).
// Optional: PORTAL_RETURN_URL (where the portal's "return" link points).
//
// One-time Stripe setup: activate the Customer Portal in test mode at
// https://dashboard.stripe.com/test/settings/billing/portal and allow
// "Cancel subscriptions".

import Stripe from 'https://esm.sh/stripe@16.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'Not authenticated' }, 401);

    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );
    const { data: { user }, error: userErr } = await anon.auth.getUser(jwt);
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: row } = await admin
      .from('chrome_snapshot_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const customerId = row?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return json({ error: 'No billing account found for this user.' }, 400);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url:
        Deno.env.get('PORTAL_RETURN_URL') || 'https://stripe.com/billing',
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
