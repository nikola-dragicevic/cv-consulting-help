import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { isAdminUser } from "@/lib/admin";
import { countCandidateApplications } from "@/lib/applicationUsage";
import { countCandidateInterviewPreparations } from "@/lib/interviewPreparationUsage";
import { getRemainingQuota, getUserEntitlements } from "@/lib/subscriptionEntitlements";

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        hasActiveSubscription: false,
        hasRepresentationSubscription: false,
        freeApplicationsUsed: 0,
        freeApplicationsRemaining: 2,
        applicationLimit: 2,
        interviewPreparationsUsed: 0,
        interviewPreparationsRemaining: 2,
        interviewPreparationLimit: 2,
      }, { status: 200 });
    }

    if (!user.email) {
      return NextResponse.json({
        hasActiveSubscription: false,
        hasRepresentationSubscription: false,
        freeApplicationsUsed: 0,
        freeApplicationsRemaining: 2,
        applicationLimit: 2,
        interviewPreparationsUsed: 0,
        interviewPreparationsRemaining: 2,
        interviewPreparationLimit: 2,
      }, { status: 200 });
    }

    const [freeApplicationsUsed, interviewPreparationsUsed, entitlements] = await Promise.all([
      countCandidateApplications(user.id),
      countCandidateInterviewPreparations(user.id),
      getUserEntitlements({
        userId: user.id,
        email: user.email,
        isAdmin: isAdminUser(user),
      }),
    ]);

    return NextResponse.json({
      hasActiveSubscription: entitlements.hasActiveSubscription,
      hasRepresentationSubscription: entitlements.hasRepresentationSubscription,
      isAdmin: entitlements.isAdmin,
      status: entitlements.isAdmin ? "admin_override" : entitlements.dashboardPlanLabel,
      freeApplicationsUsed,
      freeApplicationsRemaining: getRemainingQuota(entitlements.applicationLimit, freeApplicationsUsed),
      applicationLimit: entitlements.applicationLimit,
      interviewPreparationsUsed,
      interviewPreparationsRemaining: getRemainingQuota(entitlements.interviewPreparationLimit, interviewPreparationsUsed),
      interviewPreparationLimit: entitlements.interviewPreparationLimit,
    });
  } catch (err: unknown) {
    console.error("Subscription status error:", err);
    return NextResponse.json(
      {
        hasActiveSubscription: false,
        hasRepresentationSubscription: false,
        freeApplicationsUsed: 0,
        freeApplicationsRemaining: 2,
        applicationLimit: 2,
        interviewPreparationsUsed: 0,
        interviewPreparationsRemaining: 2,
        interviewPreparationLimit: 2,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 200 }
    );
  }
}
