import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getStripeClient } from "@/lib/stripeServer";

const stripe = getStripeClient();
const dashboardPremiumPriceId = process.env.STRIPE_PRICE_ID_DASHBOARD_PREMIUM?.trim();

export async function POST() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se";
    if (!dashboardPremiumPriceId) {
      return NextResponse.json(
        { error: "Missing STRIPE_PRICE_ID_DASHBOARD_PREMIUM" },
        { status: 500 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: dashboardPremiumPriceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard?subscription=success`,
      cancel_url: `${baseUrl}/dashboard?subscription=canceled`,
      customer_email: user.email ?? undefined,
      metadata: {
        user_id: user.id,
        order_type: "dashboard_subscription",
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
