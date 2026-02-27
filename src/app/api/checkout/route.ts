// src/app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabaseServer';
import { getStripeClient } from '@/lib/stripeServer';

const stripe = getStripeClient();
const oneTimePriceByFlow: Record<string, string | undefined> = {
  booking: process.env.STRIPE_PRICE_ID_CV_LETTER_CONSULTATION?.trim(),
  cv_letter_intake: process.env.STRIPE_PRICE_ID_CV_AND_LETTER?.trim(),
  cv_intake: process.env.STRIPE_PRICE_ID_CV_ONLY?.trim(),
};

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      packageName,
      amount,
      bookingDate,
      bookingTime,
      orderType,
      intakeType,
      targetJobLink,
      intakePayload,
    } = await req.json();

    if (!amount) {
        return NextResponse.json({ error: 'Missing amount' }, { status: 400 });
    }

    const isBookingOrder = Boolean(bookingDate && bookingTime);
    const isDocumentIntakeOrder = orderType === "document_intake";
    const packageFlow = isBookingOrder ? "booking" : (intakeType || "cv_intake");
    const mappedPriceId = oneTimePriceByFlow[packageFlow];
    const productDescription = isBookingOrder
      ? `Bokning: ${bookingDate} kl ${bookingTime}`
      : `Beställning mottagen${intakeType ? ` (${intakeType})` : ''}`;

    let documentOrderId: string | null = null;

    if (isDocumentIntakeOrder) {
      const safeTargetJobLink = typeof targetJobLink === "string" && targetJobLink.trim() ? targetJobLink.trim() : null;
      if (safeTargetJobLink) {
        try {
          const url = new URL(safeTargetJobLink);
          if (!["http:", "https:"].includes(url.protocol)) {
            return NextResponse.json({ error: "Invalid target job link protocol" }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ error: "Invalid target job link" }, { status: 400 });
        }
      }

      const { data: documentOrder, error: documentOrderError } = await supabase
        .from("document_orders")
        .insert({
          user_id: user.id,
          status: "draft",
          package_name: packageName || "Dokumentbeställning",
          package_flow: intakeType || "cv_intake",
          amount_sek: Number(amount),
          target_role: null,
          target_job_link: safeTargetJobLink,
          intake_payload: intakePayload && typeof intakePayload === "object" ? intakePayload : {},
        })
        .select("id")
        .single();

      if (documentOrderError || !documentOrder) {
        console.error("document_orders insert error:", documentOrderError);
        return NextResponse.json({ error: "Failed to create document order" }, { status: 500 });
      }

      documentOrderId = documentOrder.id;
    }

    // Create Stripe Session with Dynamic Price Data
    const lineItem = mappedPriceId
      ? { price: mappedPriceId, quantity: 1 }
      : {
          price_data: {
            currency: 'sek',
            product_data: {
              name: packageName || 'Konsultation',
              description: productDescription,
            },
            unit_amount: amount * 100, // Stripe expects Ore
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [lineItem],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://jobbnu.se'}/success?session_id={CHECKOUT_SESSION_ID}${documentOrderId ? `&document_order_id=${documentOrderId}` : ''}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://jobbnu.se'}/?canceled=true`,
      customer_email: user.email,
      
      // Save metadata for the Webhook to read later
      metadata: {
        user_id: user.id,
        order_type: orderType || (isBookingOrder ? 'booking' : 'document_order'),
        intake_type: intakeType || '',
        document_order_id: documentOrderId || '',
        booking_date: bookingDate || '',
        booking_time: bookingTime || '',
      },
    });

    if (documentOrderId) {
      const { error: updateOrderError } = await supabase
        .from("document_orders")
        .update({
          status: "checkout_created",
          stripe_checkout_session_id: session.id,
          stripe_customer_email: user.email || null,
          stripe_status: session.payment_status || null,
        })
        .eq("id", documentOrderId)
        .eq("user_id", user.id);

      if (updateOrderError) {
        console.error("document_orders update error:", updateOrderError);
      }
    }

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error('Stripe error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
