// src/app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSupabase } from '@/lib/supabaseServer';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil', // Updated API version, older is fine too
});

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { packageName, amount, bookingDate, bookingTime } = await req.json();

    if (!amount || !bookingDate || !bookingTime) {
        return NextResponse.json({ error: 'Missing booking details (Date, Time or Amount)' }, { status: 400 });
    }

    // Create Stripe Session with Dynamic Price Data
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'sek',
            product_data: {
              name: packageName || 'Konsultation',
              description: `Bokning: ${bookingDate} kl ${bookingTime}`,
            },
            unit_amount: amount * 100, // Stripe expects Öre (cents)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://jobbnu.se'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://jobbnu.se'}/?canceled=true`,
      customer_email: user.email,
      
      // Save metadata for the Webhook to read later
      metadata: {
        user_id: user.id,
        booking_date: bookingDate,
        booking_time: bookingTime,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}