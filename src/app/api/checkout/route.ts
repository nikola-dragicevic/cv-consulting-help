// src/app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabaseServer';
import { getStripeClient } from '@/lib/stripeServer';
import { isAdminUser } from '@/lib/admin';

const stripe = getStripeClient();
const oneTimePriceByFlow: Record<string, string | undefined> = {
  booking: process.env.STRIPE_PRICE_ID_CV_LETTER_CONSULTATION?.trim(),
  cv_letter_intake: process.env.STRIPE_PRICE_ID_CV_AND_LETTER?.trim(),
  cv_intake: process.env.STRIPE_PRICE_ID_CV_ONLY?.trim(),
};

type IntakeExperience = {
  title?: string;
  company?: string;
  city?: string;
  start?: string;
  end?: string;
  current?: boolean;
  tasks?: string;
  achievements?: string;
  tools?: string;
};

type IntakeEducation = {
  program?: string;
  school?: string;
  city?: string;
  start?: string;
  end?: string;
  current?: boolean;
  details?: string;
};

type IntakeData = {
  fullName?: string;
  address?: string;
  phone?: string;
  email?: string;
  profileSummary?: string;
  skills?: string;
  certifications?: string;
  languages?: string;
  driverLicense?: string;
  additionalInfo?: string;
  includeFullAddressInCv?: boolean;
  includeExperience3?: boolean;
  includeAdditionalEducation?: boolean;
  experiences?: IntakeExperience[];
  education?: IntakeEducation;
  education2?: IntakeEducation;
  jobTitle?: string;
  companyName?: string;
  jobAdText?: string;
  whyThisRole?: string;
  whyThisCompany?: string;
  keyExamples?: string;
  explainInLetter?: string;
  tone?: string;
  letterLanguage?: string;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeIntakeExperience(input: unknown): IntakeExperience | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  return {
    title: asTrimmedString(row.title) || undefined,
    company: asTrimmedString(row.company) || undefined,
    city: asTrimmedString(row.city) || undefined,
    start: asTrimmedString(row.start) || undefined,
    end: asTrimmedString(row.end) || undefined,
    current: typeof row.current === "boolean" ? row.current : undefined,
    tasks: asTrimmedString(row.tasks) || undefined,
    achievements: asTrimmedString(row.achievements) || undefined,
    tools: asTrimmedString(row.tools) || undefined,
  };
}

function normalizeIntakeEducation(input: unknown): IntakeEducation | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  return {
    program: asTrimmedString(row.program) || undefined,
    school: asTrimmedString(row.school) || undefined,
    city: asTrimmedString(row.city) || undefined,
    start: asTrimmedString(row.start) || undefined,
    end: asTrimmedString(row.end) || undefined,
    current: typeof row.current === "boolean" ? row.current : undefined,
    details: asTrimmedString(row.details) || undefined,
  };
}

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
      bypassPayment,
    } = await req.json();

    if (!amount) {
        return NextResponse.json({ error: 'Missing amount' }, { status: 400 });
    }

    const isBookingOrder = Boolean(bookingDate && bookingTime);
    const isDocumentIntakeOrder = orderType === "document_intake";
    const isAdminBypass = Boolean(bypassPayment) && isAdminUser(user);
    const packageFlow = isBookingOrder ? "booking" : (intakeType || "cv_intake");
    const mappedPriceId = oneTimePriceByFlow[packageFlow];
    const productDescription = isBookingOrder
      ? `Bokning: ${bookingDate} kl ${bookingTime}`
      : `Beställning mottagen${intakeType ? ` (${intakeType})` : ''}`;

    let documentOrderId: string | null = null;
    let intakeData: IntakeData | null = null;

    if (isDocumentIntakeOrder) {
      if (intakePayload && typeof intakePayload === "object" && intakePayload.data && typeof intakePayload.data === "object") {
        intakeData = intakePayload.data as IntakeData;
      }

      const experiences = Array.isArray(intakeData?.experiences)
        ? intakeData!.experiences
            .slice(0, 3)
            .map((row) => normalizeIntakeExperience(row))
            .filter((row): row is IntakeExperience => Boolean(row))
        : [];
      const primaryEducation = normalizeIntakeEducation(intakeData?.education);
      const additionalEducation = normalizeIntakeEducation(intakeData?.education2);
      const submittedAtRaw =
        intakePayload && typeof intakePayload === "object" && "submittedAt" in intakePayload
          ? asTrimmedString((intakePayload as Record<string, unknown>).submittedAt)
          : null;

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
          target_role: asTrimmedString(intakeData?.jobTitle),
          target_job_link: safeTargetJobLink,
          intake_payload: intakePayload && typeof intakePayload === "object" ? intakePayload : {},
          intake_submitted_at: submittedAtRaw,
          intake_full_name: asTrimmedString(intakeData?.fullName),
          intake_email: asTrimmedString(intakeData?.email),
          intake_phone: asTrimmedString(intakeData?.phone),
          intake_address: asTrimmedString(intakeData?.address),
          intake_profile_summary: asTrimmedString(intakeData?.profileSummary),
          intake_skills_text: asTrimmedString(intakeData?.skills),
          intake_certifications_text: asTrimmedString(intakeData?.certifications),
          intake_languages_text: asTrimmedString(intakeData?.languages),
          intake_driver_license: asTrimmedString(intakeData?.driverLicense),
          intake_additional_info: asTrimmedString(intakeData?.additionalInfo),
          intake_include_full_address_in_cv: asBoolean(intakeData?.includeFullAddressInCv),
          intake_include_experience_3: asBoolean(intakeData?.includeExperience3),
          intake_include_additional_education: asBoolean(intakeData?.includeAdditionalEducation),
          intake_experiences: experiences,
          intake_education_primary: primaryEducation || {},
          intake_education_additional: additionalEducation || {},
          letter_job_title: asTrimmedString(intakeData?.jobTitle),
          letter_company_name: asTrimmedString(intakeData?.companyName),
          letter_job_ad_text: asTrimmedString(intakeData?.jobAdText),
          letter_why_this_role: asTrimmedString(intakeData?.whyThisRole),
          letter_why_this_company: asTrimmedString(intakeData?.whyThisCompany),
          letter_key_examples: asTrimmedString(intakeData?.keyExamples),
          letter_explain_in_letter: asTrimmedString(intakeData?.explainInLetter),
          letter_tone: asTrimmedString(intakeData?.tone),
          letter_language: asTrimmedString(intakeData?.letterLanguage),
        })
        .select("id")
        .single();

      if (documentOrderError || !documentOrder) {
        console.error("document_orders insert error:", documentOrderError);
        return NextResponse.json({ error: "Failed to create document order" }, { status: 500 });
      }

      documentOrderId = documentOrder.id;

      if (Boolean(bypassPayment) && !isAdminBypass) {
        return NextResponse.json({ error: "Only admin can bypass payment" }, { status: 403 });
      }

      if (isAdminBypass) {
        const { error: bypassUpdateError } = await supabase
          .from("document_orders")
          .update({
            status: "paid",
            stripe_status: "admin_bypass",
            stripe_customer_email: user.email || null,
            paid_at: new Date().toISOString(),
          })
          .eq("id", documentOrderId)
          .eq("user_id", user.id);

        if (bypassUpdateError) {
          console.error("document_orders bypass update error:", bypassUpdateError);
          return NextResponse.json({ error: "Failed to finalize admin bypass order" }, { status: 500 });
        }

        return NextResponse.json({
          bypassed: true,
          documentOrderId,
        });
      }
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
