import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "JobbNu Extension Support",
  description: "Support page for the JobbNu Chrome extension.",
};

export default function ExtensionSupportPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <Card className="rounded-2xl border border-slate-200 shadow-lg">
          <CardHeader className="rounded-t-2xl border-b bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">JobbNu Extension</p>
            <CardTitle className="mt-1 text-3xl font-semibold text-slate-900">
              Support
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Need help with autofill, permissions, or supported portals? Start here.
            </p>
          </CardHeader>

          <CardContent className="prose prose-slate max-w-none space-y-6 pt-6">
            <h3>What the extension does</h3>
            <p>
              The JobbNu extension helps a logged-in JobbNu user autofill common fields on external job application
              portals, such as name, email, phone, city and CV upload.
            </p>

            <h3>Current best-supported browsers</h3>
            <ul>
              <li>Google Chrome</li>
              <li>Microsoft Edge is expected to be compatible with only minor adjustments</li>
            </ul>

            <h3>Current limitations</h3>
            <ul>
              <li>External portals differ a lot, so some fields may still need manual review.</li>
              <li>The extension does not submit the application automatically.</li>
              <li>Some file-upload widgets or custom dropdowns may require manual interaction.</li>
            </ul>

            <h3>How to use it</h3>
            <ol>
              <li>Stay logged in to JobbNu in the same browser.</li>
              <li>Open the external application page.</li>
              <li>Open the JobbNu extension popup.</li>
              <li>Use the scan or fill action.</li>
              <li>Review everything before submitting the application.</li>
            </ol>

            <h3>Supported portal direction</h3>
            <p>
              JobbNu is prioritizing support for Teamtailor, Workday and Greenhouse style application forms first.
            </p>

            <h3>Contact</h3>
            <p>
              Email: <a href="mailto:info@jobbnu.se">info@jobbnu.se</a>
            </p>

            <h3>Useful links</h3>
            <ul>
              <li>
                <Link href="/integritetspolicy/extension">Extension privacy policy</Link>
              </li>
              <li>
                <Link href="/integritetspolicy">General JobbNu privacy policy</Link>
              </li>
              <li>
                <Link href="/dashboard">Go to dashboard</Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
