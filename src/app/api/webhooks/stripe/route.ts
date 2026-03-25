import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/stripeServer';
import { runGeneration } from '@/app/api/generate-cv/route';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required");
  }

  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY is required");
  }

  return createClient(supabaseUrl, serviceKey);
}

async function updateRepresentationStatus(params: {
  userId: string;
  active: boolean;
  status: string | null;
  currentPeriodEnd?: number | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  startedAt?: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const patch: Record<string, unknown> = {
    representation_active: params.active,
    representation_status: params.status,
    representation_current_period_end: params.currentPeriodEnd
      ? new Date(params.currentPeriodEnd * 1000).toISOString()
      : null,
    representation_subscription_id: params.subscriptionId || null,
    representation_customer_id: params.customerId || null,
  };

  if (params.startedAt) {
    patch.representation_started_at = params.startedAt;
  }

  const { error } = await supabaseAdmin
    .from("candidate_profiles")
    .update(patch)
    .eq("user_id", params.userId);

  if (error) {
    console.error("Fel vid uppdatering av representation_status:", error);
  }
}

export async function POST(req: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is missing" }, { status: 500 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const body = await req.text();
  const h = await headers();
  const signature = h.get("stripe-signature");
if (!signature) {
  return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
}

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown webhook error";
    console.error(`Webhook Error: ${message}`);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // ✅ Hantera lyckad betalning
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Hämta metadatan vi skickade i steg 4
    const { user_id, booking_date, booking_time, document_order_id } = session.metadata || {};

    if (user_id && booking_date && booking_time) {
        console.log(`💰 Betalning klar! Bokar tid för ${user_id} den ${booking_date} kl ${booking_time}`);

        // Spara i Supabase
        const { error } = await supabaseAdmin
            .from('bookings')
            .insert({
                user_id: user_id,
                customer_email: session.customer_details?.email,
                booking_date: booking_date,
                start_time: booking_time,
                end_time: calculateEndTime(booking_time), // Hjälpfunktion nedan
                stripe_session_id: session.id,
                status: 'confirmed'
            });

        if (error) {
            console.error('Fel vid sparande av bokning:', error);
            return NextResponse.json({ error: 'DB Insert Failed' }, { status: 500 });
        }
    }

    if (document_order_id) {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      const { error: orderUpdateError } = await supabaseAdmin
        .from("document_orders")
        .update({
          status: "paid",
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
          stripe_customer_email: session.customer_details?.email ?? session.customer_email ?? null,
          stripe_status: session.payment_status ?? null,
          paid_at: new Date().toISOString(),
        })
        .eq("id", document_order_id);

      if (orderUpdateError) {
        console.error("Fel vid uppdatering av document_orders:", orderUpdateError);
        return NextResponse.json({ error: "Document order update failed" }, { status: 500 });
      }

      // 🤖 Trigger CV/letter generation — fire-and-forget so Stripe isn't kept waiting
      runGeneration(document_order_id).catch((err) =>
        console.error("[webhook] CV generation failed for order", document_order_id, err)
      );
    }

    if (session.metadata?.order_type === "representation_subscription" && session.metadata?.user_id) {
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      let currentPeriodEnd: number | null = null;
      let subscriptionStatus: string | null = null;

      if (subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          currentPeriodEnd = subscription.items.data[0]?.current_period_end ?? null;
          subscriptionStatus = subscription.status ?? null;
        } catch (err) {
          console.error("Kunde inte hämta representation-subscription:", err);
        }
      }

      await updateRepresentationStatus({
        userId: session.metadata.user_id,
        active: subscriptionStatus ? ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus as Stripe.Subscription.Status) : true,
        status: subscriptionStatus || "active",
        currentPeriodEnd,
        subscriptionId,
        customerId:
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null,
        startedAt: new Date().toISOString(),
      });
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    if (subscription.metadata?.order_type === "representation_subscription" && subscription.metadata?.user_id) {
      await updateRepresentationStatus({
        userId: subscription.metadata.user_id,
        active: ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status),
        status: subscription.status,
        currentPeriodEnd: subscription.items.data[0]?.current_period_end ?? null,
        subscriptionId: subscription.id,
        customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
      });
    }
  }

  return NextResponse.json({ received: true });
}

function calculateEndTime(startTime: string) {
    // Enkel logik: Lägg på 1 timme. 
    // "10:00" -> "11:00"
    const [hours, minutes] = startTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours + 1); // +1 timme intervju
    date.setMinutes(minutes);
    return date.toTimeString().slice(0, 5);
}
