import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getStripeClient } from "@/lib/stripeServer";
import { AUTO_APPLY_UPGRADE_DELTA_SEK, getUserEntitlements } from "@/lib/subscriptionEntitlements";
import { resolveAffiliateForCurrentUser } from "@/lib/affiliate";

const MONTHLY_PRICE_SEK = 300;

export async function POST() {
  try {
    const stripe = getStripeClient();
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se";
    const entitlements = await getUserEntitlements({
      userId: user.id,
      email: user.email,
    });
    const affiliateCreator = await resolveAffiliateForCurrentUser({
      userId: user.id,
      email: user.email,
      checkoutStartedAtField: "auto_apply_checkout_started_at",
    });
    const isUpgradeFromPremium = entitlements.hasActiveSubscription && !entitlements.hasRepresentationSubscription;
    const amountSek = isUpgradeFromPremium ? AUTO_APPLY_UPGRADE_DELTA_SEK : MONTHLY_PRICE_SEK;
    const priceId = isUpgradeFromPremium
      ? process.env.STRIPE_PRICE_ID_AUTO_APPLY_UPGRADE?.trim()
      : process.env.STRIPE_PRICE_ID_REPRESENTATION?.trim();

    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: "sek",
            unit_amount: amountSek * 100,
            recurring: { interval: "month" as const },
            product_data: {
              name: "Auto Apply",
              description: isUpgradeFromPremium
                ? "Uppgradering från Dashboard Premium till Auto Apply med obegränsade email och intervjuförberedelser."
                : "JobbNu hjälper kandidaten att skicka fler ansökningar, generera personliga email och förbereda intervjuer.",
            },
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [lineItem],
      success_url: `${baseUrl}/dashboard?representation=success`,
      cancel_url: `${baseUrl}/?representation=canceled#packages`,
      customer_email: user.email ?? undefined,
      metadata: {
        user_id: user.id,
        order_type: "representation_subscription",
        affiliate_creator_id: affiliateCreator?.id ?? "",
        affiliate_code: affiliateCreator?.code ?? "",
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          order_type: "representation_subscription",
          affiliate_creator_id: affiliateCreator?.id ?? "",
          affiliate_code: affiliateCreator?.code ?? "",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("Representation checkout error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
