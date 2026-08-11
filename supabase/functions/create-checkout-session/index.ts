// create-checkout-session — Supabase Edge Function (Deno)
//
// Called by the extension (with the signed-in user's JWT). Creates or reuses a
// Stripe customer for that user and returns a Stripe Checkout URL for the
// $7/month subscription. The Stripe secret key lives only here, never in the
// extension.
//
// Required function secrets:
//   STRIPE_SECRET_KEY   (sk_test_...)
//   STRIPE_PRICE_ID     (price_... for the $7/month recurring price)
//   CHECKOUT_SUCCESS_URL / CHECKOUT_CANCEL_URL  (optional; any https page)
// Auto-provided by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@16.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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

    // Identify the caller from their JWT.
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );
    const {
      data: { user },
      error: userErr,
    } = await anon.auth.getUser(jwt);
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

    // Admin client (service role) to read/write the subscription mapping.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find or create the Stripe customer for this user.
    const { data: existing } = await admin
      .from('chrome_snapshot_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from('chrome_snapshot_subscriptions')
        .upsert(
          { user_id: user.id, stripe_customer_id: customerId, status: 'inactive' },
          { onConflict: 'user_id' }
        );
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
      success_url:
        Deno.env.get('CHECKOUT_SUCCESS_URL') ||
        'https://checkout.stripe.com/success',
      cancel_url:
        Deno.env.get('CHECKOUT_CANCEL_URL') ||
        'https://checkout.stripe.com/cancel',
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
