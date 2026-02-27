import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function getStripeSecretKey() {
  const raw = process.env.STRIPE_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error("STRIPE_SECRET_KEY is missing");
  }
  if (!raw.startsWith("sk_")) {
    throw new Error("STRIPE_SECRET_KEY must be a secret key (sk_...), not a publishable key (pk_...)");
  }
  return raw;
}

export function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey(), {
      apiVersion: "2025-06-30.basil",
    });
  }
  return stripeClient;
}
