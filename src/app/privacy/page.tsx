// PATH: src/app/privacy/page.tsx
import { BackButton } from "@/components/back-button"

// CHANGE THIS to the email students can write to
const CONTACT_EMAIL = "your-email@gmail.com"

export const metadata = { title: "Privacy Policy" }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto max-w-2xl space-y-5 text-sm leading-relaxed text-foreground">
        <BackButton fallback="/login" />
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
        <p className="text-gray-500">StudyBuddy NG · Last updated: November 2026</p>

        <p>
          StudyBuddy NG (&ldquo;StudyBuddy&rdquo;, &ldquo;we&rdquo;) helps Nigerian students turn their class notes into
          practice questions. This page explains what we collect and how we use it.
        </p>

        <h2 className="text-lg font-semibold">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>From your Google account: your name and email address (nothing else, and never your Google password).</li>
          <li>What you tell us: your type of school, school name, department and level.</li>
          <li>What you upload and create: class notes, courses, quiz results, tutor chats and study streaks.</li>
        </ul>

        <h2 className="text-lg font-semibold">How we use it</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To sign you in and keep your account.</li>
          <li>To make quizzes, flashcards and tutor answers from your notes.</li>
          <li>To show you notes that classmates in your school and department chose to share.</li>
        </ul>

        <h2 className="text-lg font-semibold">Who processes your data</h2>
        <p>
          Your account and notes are stored with Supabase. The text of your notes is sent to Google&apos;s Gemini AI
          to write questions and tutor answers. The website is hosted on Vercel. We do not sell your data and we do
          not show ads.
        </p>

        <h2 className="text-lg font-semibold">Sharing</h2>
        <p>
          Your notes are private unless you choose to share them with your department. Your email is never shown to
          other students.
        </p>

        <h2 className="text-lg font-semibold">Your choices</h2>
        <p>
          You can ask us to delete your account and all your data at any time by writing to{" "}
          <a className="text-primary font-medium" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . We handle your data in line with the Nigeria Data Protection Act.
        </p>

        <h2 className="text-lg font-semibold">Changes</h2>
        <p>If we change this policy, the date at the top will change.</p>
      </div>
    </div>
  )
}
