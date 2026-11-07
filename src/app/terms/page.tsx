// PATH: src/app/terms/page.tsx
import { BackButton } from "@/components/back-button"

// CHANGE THIS to the email students can write to
const CONTACT_EMAIL = "your-email@gmail.com"

export const metadata = { title: "Terms of Service" }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto max-w-2xl space-y-5 text-sm leading-relaxed text-foreground">
        <BackButton fallback="/login" />
        <h1 className="text-2xl font-bold">Terms of Service</h1>
        <p className="text-gray-500">StudyBuddy NG · Last updated: November 2026</p>

        <p>By using StudyBuddy NG you agree to these terms.</p>

        <h2 className="text-lg font-semibold">Using the app</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Use your own Google account and keep it secure.</li>
          <li>Only upload notes you have the right to use. Do not upload anything illegal or harmful.</li>
          <li>Do not try to break, overload or misuse the app or its AI features. Daily limits apply.</li>
        </ul>

        <h2 className="text-lg font-semibold">AI answers</h2>
        <p>
          Quizzes and tutor answers are written by AI and can contain mistakes. Always check important facts with
          your lecturer or textbook. StudyBuddy is a study aid, not a replacement for your course.
        </p>

        <h2 className="text-lg font-semibold">Shared notes</h2>
        <p>
          When you share notes with your department, you confirm they are yours to share. We may remove shared
          content that breaks these terms.
        </p>

        <h2 className="text-lg font-semibold">Accounts</h2>
        <p>
          We may suspend accounts that misuse the app. You can ask us to delete your account at any time by writing
          to{" "}
          <a className="text-primary font-medium" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>

        <h2 className="text-lg font-semibold">No guarantees</h2>
        <p>The app is provided as it is. We do our best to keep it running but cannot promise it will always be available.</p>
      </div>
    </div>
  )
}
