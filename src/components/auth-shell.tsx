// PATH: src/components/auth-shell.tsx
// The shared frame for the Sign up and Log in pages.
//  - Phone:   a blue header on top, the form sits on a rounded sheet below it.
//  - Laptop:  two columns. Blue panel with the story on the left, the form on the right.

import Link from "next/link"
import { cn } from "@/lib/utils"
import { FileUp, ListChecks, Sparkles } from "lucide-react"

const steps = [
  { icon: FileUp, title: "Upload your notes", text: "PDF, Word, PowerPoint, Excel or a photo." },
  { icon: ListChecks, title: "Take a timed test", text: "Questions are written from your own notes." },
  { icon: Sparkles, title: "Learn with the AI tutor", text: "Explained in simple words, topic by topic." },
]

export function AuthShell({
  active,
  headline,
  subtext,
  heading,
  children,
}: {
  active: "signup" | "login"
  headline: string
  subtext: string
  heading: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[5fr_6fr]">
      {/* Blue panel */}
      <aside className="relative overflow-hidden bg-[#1d2b7a] text-white px-6 pt-10 pb-16 sm:px-10 lg:px-14 lg:py-14 lg:min-h-screen lg:flex lg:flex-col lg:justify-between">
        {/* Dotted background */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative max-w-md mx-auto lg:mx-0 lg:max-w-none w-full">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2.5">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </span>
            <span className="text-xl font-semibold">StudyBuddy</span>
          </div>

          <h1 className="mt-8 lg:mt-20 text-3xl lg:text-5xl font-bold leading-tight lg:max-w-md">
            {headline}
          </h1>
          <p className="mt-3 text-white/70 hidden sm:block lg:text-lg lg:max-w-md">{subtext}</p>
        </div>

        {/* The three steps: a real sequence, so numbered (laptop only) */}
        <ol className="relative hidden lg:block space-y-5 max-w-md">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex items-start gap-4">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center">
                <Icon size={18} className="text-accent" />
              </span>
              <div>
                <p className="font-medium">
                  {i + 1}. {title}
                </p>
                <p className="text-sm text-white/60">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>

      {/* Form side */}
      <main
        className={cn(
          "relative -mt-8 rounded-t-3xl bg-background px-5 pt-7 pb-12 sm:px-10",
          "lg:mt-0 lg:rounded-none lg:px-14 lg:py-14 lg:flex lg:items-center lg:justify-center"
        )}
      >
        <div className="mx-auto w-full max-w-md">
          <div className="flex gap-2 mb-6 p-1 rounded-2xl bg-muted">
            <Link
              href="/signup"
              className={cn(
                "flex-1 h-10 rounded-xl text-sm font-medium flex items-center justify-center transition-colors",
                active === "signup" ? "bg-card text-primary shadow-sm" : "text-gray-500"
              )}
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className={cn(
                "flex-1 h-10 rounded-xl text-sm font-medium flex items-center justify-center transition-colors",
                active === "login" ? "bg-card text-primary shadow-sm" : "text-gray-500"
              )}
            >
              Log in
            </Link>
          </div>

          <h2 className="text-2xl font-bold mb-5">{heading}</h2>
          {children}
        </div>
      </main>
    </div>
  )
}
