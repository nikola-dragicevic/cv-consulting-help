import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";
import { isAdminUser } from "@/lib/admin";
import { getStripeClient } from "@/lib/stripeServer";
import { countCandidateApplications, FREE_AUTO_APPLY_APPLICATIONS } from "@/lib/applicationUsage";

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
    const stripe = getStripeClient();
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        hasActiveSubscription: false,
        hasRepresentationSubscription: false,
        freeApplicationsUsed: 0,
        freeApplicationsRemaining: FREE_AUTO_APPLY_APPLICATIONS,
      }, { status: 200 });
    }

    if (!user.email) {
      return NextResponse.json({
        hasActiveSubscription: false,
        hasRepresentationSubscription: false,
        freeApplicationsUsed: 0,
        freeApplicationsRemaining: FREE_AUTO_APPLY_APPLICATIONS,
      }, { status: 200 });
    }

    const freeApplicationsUsed = await countCandidateApplications(user.id);
    const freeApplicationsRemaining = Math.max(0, FREE_AUTO_APPLY_APPLICATIONS - freeApplicationsUsed);

    if (isAdminUser(user)) {
      return NextResponse.json({
        hasActiveSubscription: true,
        hasRepresentationSubscription: true,
        status: "admin_override",
        currentPeriodEnd: null,
        isAdmin: true,
        freeApplicationsUsed,
        freeApplicationsRemaining: FREE_AUTO_APPLY_APPLICATIONS,
      });
    }

    // Check manual_premium override in DB first (fast, no Stripe API call needed)
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from("candidate_profiles")
      .select("manual_premium,representation_active,representation_status,representation_current_period_end")
      .eq("user_id", user.id)
      .single();

    const representationActive = profile?.representation_active === true;

    if (profile?.manual_premium === true) {
      return NextResponse.json({
        hasActiveSubscription: true,
        hasRepresentationSubscription: representationActive,
        status: "manual_premium",
        currentPeriodEnd: null,
        representationStatus: profile?.representation_status ?? null,
        representationCurrentPeriodEnd: profile?.representation_current_period_end ?? null,
        freeApplicationsUsed,
        freeApplicationsRemaining: representationActive ? FREE_AUTO_APPLY_APPLICATIONS : freeApplicationsRemaining,
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
          hasRepresentationSubscription: representationActive,
          status: activeSub.status,
          currentPeriodEnd: activeSub.items.data[0]?.current_period_end ?? null,
          representationStatus: profile?.representation_status ?? null,
          representationCurrentPeriodEnd: profile?.representation_current_period_end ?? null,
          freeApplicationsUsed,
          freeApplicationsRemaining: representationActive ? FREE_AUTO_APPLY_APPLICATIONS : freeApplicationsRemaining,
        });
      }
    }

    return NextResponse.json({
      hasActiveSubscription: false,
      hasRepresentationSubscription: representationActive,
      representationStatus: profile?.representation_status ?? null,
      representationCurrentPeriodEnd: profile?.representation_current_period_end ?? null,
      freeApplicationsUsed,
      freeApplicationsRemaining: representationActive ? FREE_AUTO_APPLY_APPLICATIONS : freeApplicationsRemaining,
    });
  } catch (err: unknown) {
    console.error("Subscription status error:", err);
    return NextResponse.json(
      {
        hasActiveSubscription: false,
        hasRepresentationSubscription: false,
        freeApplicationsUsed: 0,
        freeApplicationsRemaining: FREE_AUTO_APPLY_APPLICATIONS,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 200 }
    );
  }
}
