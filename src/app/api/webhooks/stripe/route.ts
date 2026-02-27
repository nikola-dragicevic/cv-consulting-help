import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/stripeServer';

const stripe = getStripeClient();
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Initiera Supabase Admin (för att kunna skriva till DB utan inloggad användare)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // VIKTIGT: Använd Service Key här, inte Anon key
);

export async function POST(req: Request) {
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
