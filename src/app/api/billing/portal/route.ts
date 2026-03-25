import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getStripeClient } from "@/lib/stripeServer";

export async function POST() {
  try {
    const stripe = getStripeClient();
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customers = await stripe.customers.list({
      email: user.email,
      limit: 10,
    });

    const customer = customers.data[0];
    if (!customer) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
    }

    const returnUrl =
      process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL?.trim() ||
      `${process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se"}/dashboard`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("Billing portal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
