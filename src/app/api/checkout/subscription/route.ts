import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getStripeClient } from "@/lib/stripeServer";
import { resolveAffiliateForCurrentUser } from "@/lib/affiliate";

const MONTHLY_PRICE_SEK = 99;

export async function POST() {
  try {
    const stripe = getStripeClient();
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se";
    const priceId = process.env.STRIPE_PRICE_ID_DASHBOARD_PREMIUM?.trim();
    const affiliateCreator = await resolveAffiliateForCurrentUser({
      userId: user.id,
      email: user.email,
      checkoutStartedAtField: "dashboard_checkout_started_at",
    });

    // Use pre-configured recurring price ID if available; otherwise build price_data
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: "sek",
            unit_amount: MONTHLY_PRICE_SEK * 100,
            recurring: { interval: "month" as const },
            product_data: {
              name: "Dashboard Premium",
              description: "Obegränsad jobbmatchning – AI matchar ditt CV mot tusentals jobb.",
            },
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [lineItem],
      success_url: `${baseUrl}/dashboard?subscription=success`,
      cancel_url: `${baseUrl}/dashboard?subscription=canceled`,
      customer_email: user.email ?? undefined,
      metadata: {
        user_id: user.id,
        order_type: "dashboard_subscription",
        affiliate_creator_id: affiliateCreator?.id ?? "",
        affiliate_code: affiliateCreator?.code ?? "",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("Subscription checkout error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
