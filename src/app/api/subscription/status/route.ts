import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";
import { isAdminUser } from "@/lib/admin";
import { getStripeClient } from "@/lib/stripeServer";

const stripe = getStripeClient();

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

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

    if (isAdminUser(user)) {
      return NextResponse.json({
        hasActiveSubscription: true,
        status: "admin_override",
        currentPeriodEnd: null,
        isAdmin: true,
      });
    }

    // Check manual_premium override in DB first (fast, no Stripe API call needed)
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from("candidate_profiles")
      .select("manual_premium")
      .eq("user_id", user.id)
      .single();

    if (profile?.manual_premium === true) {
      return NextResponse.json({
        hasActiveSubscription: true,
        status: "manual_premium",
        currentPeriodEnd: null,
      });
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
