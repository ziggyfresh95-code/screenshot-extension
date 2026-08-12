// stripe-webhook — Supabase Edge Function (Deno)
//
// Receives Stripe events and records subscription status in the
// chrome_snapshot_subscriptions table using the service_role key (bypasses
// RLS). Deploy WITHOUT JWT verification so Stripe can call it:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Required function secrets:
//   STRIPE_SECRET_KEY     (sk_test_...)
//   STRIPE_WEBHOOK_SECRET (whsec_... from the Stripe webhook endpoint)
// Auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@16.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function upsert(row: Record<string, unknown>) {
  await admin
    .from('chrome_snapshot_subscriptions')
    .upsert({ ...row, updated_at: new Date().toISOString() }, {
      onConflict: 'user_id',
    });
}

// Map a Stripe subscription to our table columns, including cancellation info.
function subFields(sub: Stripe.Subscription) {
  const details = sub.cancellation_details || null;
  return {
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    price_id: sub.items.data[0]?.price.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    cancellation_feedback: details?.feedback ?? null,
    cancellation_comment: details?.comment ?? null,
    cancellation_reason: details?.reason ?? null,
  };
}

// Resolve our user_id from subscription metadata, or fall back to the customer.
async function userIdFor(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = (sub.metadata?.user_id as string) || null;
  if (fromMeta) return fromMeta;
  const { data } = await admin
    .from('chrome_snapshot_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', sub.customer as string)
    .maybeSingle();
  return (data?.user_id as string) || null;
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (e) {
    return new Response(`Webhook signature error: ${(e as Error).message}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = (s.metadata?.user_id as string) || null;
        if (userId && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            s.subscription as string
          );
          await upsert({
            user_id: userId,
            status: sub.status,
            ...subFields(sub),
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await userIdFor(sub);
        if (userId) {
          await upsert({
            user_id: userId,
            status:
              event.type === 'customer.subscription.deleted'
                ? 'canceled'
                : sub.status,
            ...subFields(sub),
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    return new Response(`Handler error: ${(e as Error).message}`, {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
