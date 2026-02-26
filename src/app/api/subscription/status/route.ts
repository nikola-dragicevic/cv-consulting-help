import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSupabase } from "@/lib/supabaseServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ hasActiveSubscription: false }, { status: 200 });
    }

    if (!user.email) {
      return NextResponse.json({ hasActiveSubscription: false }, { status: 200 });
    }

    const customers = await stripe.customers.list({
      email: user.email,
      limit: 10,
    });

    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 20,
      });

      const activeSub = subscriptions.data.find((sub) => ACTIVE_STATUSES.has(sub.status));
      if (activeSub) {
        return NextResponse.json({
          hasActiveSubscription: true,
          status: activeSub.status,
          currentPeriodEnd: activeSub.items.data[0]?.current_period_end ?? null,
        });
      }
    }

    return NextResponse.json({ hasActiveSubscription: false });
  } catch (err: unknown) {
    console.error("Subscription status error:", err);
    return NextResponse.json(
      { hasActiveSubscription: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 200 }
    );
  }
}
