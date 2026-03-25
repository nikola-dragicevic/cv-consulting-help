import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "JobbNu Extension Privacy Policy",
  description: "Privacy policy for the JobbNu Chrome extension.",
};

export default function ExtensionPrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <Card className="rounded-2xl border border-slate-200 shadow-lg">
          <CardHeader className="rounded-t-2xl border-b bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">JobbNu Extension</p>
            <CardTitle className="mt-1 text-3xl font-semibold text-slate-900">
              Privacy Policy
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Last updated: <span className="font-medium">2026-03-24</span>
            </p>
          </CardHeader>

          <CardContent className="prose prose-slate max-w-none space-y-6 pt-6">
            <p>
              This privacy policy explains how the JobbNu browser extension processes data when a user chooses to
              autofill external job application forms using profile information already stored in JobbNu.
            </p>

            <h3>1. Controller</h3>
            <p>
              JobbNu
              <br />
              Email: <a href="mailto:info@jobbnu.se">info@jobbnu.se</a>
            </p>

            <h3>2. Single purpose</h3>
            <p>
              The JobbNu extension has one single purpose: to help a logged-in JobbNu user autofill external job
              application forms with the user&apos;s own profile information and uploaded CV.
            </p>

            <h3>3. What data the extension accesses</h3>
            <ul>
              <li>Basic candidate profile data stored in JobbNu, such as name, email, phone number, city and CV.</li>
              <li>Form field labels, placeholders and input fields on the currently opened job-application page.</li>
              <li>The current page URL to identify whether the user is on a supported external application portal.</li>
            </ul>

            <h3>4. How the data is used</h3>
            <ul>
              <li>To detect likely matching fields such as first name, last name, email, phone, city and CV upload.</li>
              <li>To fill those fields on the user&apos;s behalf only after the user explicitly triggers the autofill action.</li>
              <li>To help the user complete job applications faster on external recruitment portals.</li>
            </ul>

            <h3>5. What the extension does not do</h3>
            <ul>
              <li>It does not automatically submit job applications.</li>
              <li>It does not send emails without the user reviewing and triggering the action.</li>
              <li>It does not sell personal data.</li>
              <li>It does not use job-application page content for advertising or unrelated profiling.</li>
            </ul>

            <h3>6. Sharing</h3>
            <p>
              The extension only causes data to be entered into the external application form chosen by the user. Once
              the user continues on that external site, the external employer or recruitment platform becomes
              responsible for the information submitted there.
            </p>

            <h3>7. Storage</h3>
            <p>
              The extension does not need to permanently store the candidate&apos;s job-application page content. JobbNu
              stores the user&apos;s profile data and uploaded CV in its main service environment as described in the
              general privacy policy.
            </p>

            <h3>8. Chrome Web Store user-data disclosure</h3>
            <p>
              The JobbNu extension&apos;s use of information received from Chrome browsers or related user data will adhere
              to the <strong>Chrome Web Store Developer Program Policies</strong>, including the{" "}
              <strong>Limited Use</strong> requirements.
            </p>

            <h3>9. Legal basis</h3>
            <p>
              JobbNu processes this data to provide a user-requested product function. The extension is activated by the
              user and used only to assist with the application workflow the user has chosen to perform.
            </p>

            <h3>10. Contact and rights</h3>
            <p>
              For privacy questions, support requests, or data-rights requests, contact{" "}
              <a href="mailto:info@jobbnu.se">info@jobbnu.se</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
