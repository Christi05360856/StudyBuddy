// PATH: src/app/(auth)/signup/page.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { AuthShell } from "@/components/auth-shell"
import { cn } from "@/lib/utils"
import {
  INSTITUTION_TYPES,
  INSTITUTIONS,
  type InstitutionType,
} from "@/lib/institutions"
import { LEVELS, cleanDepartment } from "@/lib/departments"
import { DepartmentField } from "@/components/department-field"

const labelClass = "block text-sm font-medium text-foreground mb-1"

export default function SignUpPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set after sign up when Supabase wants the student to confirm their email first
  const [sentTo, setSentTo] = useState<string | null>(null)

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    institutionType: "" as InstitutionType | "",
    institution: "",
    department: "",
    level: "",
    matricNumber: "",
    password: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setError(null)
  }

  const chooseType = (type: InstitutionType) => {
    setForm({ ...form, institutionType: type, institution: "" })
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      setError("Please enter both your first name and your last name")
      return
    }
    if (!form.institutionType) {
      setError("Please choose University, Polytechnic or College of Education")
      return
    }
    if (!form.institution.trim()) {
      setError("Please choose your school")
      return
    }
    // Works for a department picked from the list and for one the student typed
    const department = cleanDepartment(form.department)
    if (!department) {
      setError("Please choose or type your department")
      return
    }
    if (!form.level) {
      setError("Please choose your level")
      return
    }
    if (!form.matricNumber.trim()) {
      setError("Matric number is required")
      return
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    const supabase = createClient()

    try {
      const email = form.email.trim().toLowerCase()
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          // Where the confirmation link in the email brings the student back to
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/home`,
          data: {
            full_name: fullName,
            matric_number: form.matricNumber.trim(),
            institution: form.institution.trim(),
            department,
            level: form.level,
          },
        },
      })

      if (authError) {
        const msg = authError.message.toLowerCase()
        if (msg.includes("rate limit")) {
          throw new Error("Too many sign-up attempts. Please wait a few minutes and try again.")
        }
        if (msg.includes("already registered")) {
          throw new Error("This email is already registered. Please log in.")
        }
        // The database refuses a second account with the same matric number
        if (msg.includes("database error")) {
          throw new Error("This matric number is already registered, or your details could not be saved.")
        }
        throw authError
      }

      if (!authData.user) {
        throw new Error("Could not create your account. Please try again.")
      }

      // With email confirmation on, Supabase hides "this email already exists" by returning a user
      // with no identities. Nothing is sent in that case, so say so instead of showing "check your email".
      if (authData.user.identities && authData.user.identities.length === 0) {
        throw new Error("This email is already registered. Please log in.")
      }

      // Email confirmation is on: no session yet. The profile is created by the database
      // (supabase-update-2.sql) from the details above, and login finishes after they confirm.
      if (!authData.session) {
        setSentTo(email)
        return
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: authData.user.id,
        full_name: fullName,
        matric_number: form.matricNumber.trim(),
        institution: form.institution.trim(),
        department,
        level: form.level,
        role: "student",
      })

      if (profileError) {
        await supabase.auth.signOut()
        if (profileError.code === "23505") {
          throw new Error("This matric number is already registered.")
        }
        throw new Error("Could not save your details. Please try again.")
      }

      router.push("/home")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const schoolList = form.institutionType ? INSTITUTIONS[form.institutionType] : []

  if (sentTo) {
    return (
      <AuthShell
        active="signup"
        headline="One last step."
        subtext="Confirm your email so only you can use your account."
        heading="Check your email"
      >
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            We sent a confirmation link to <span className="font-semibold">{sentTo}</span>. Open it, then come back and log in.
          </p>
          <p className="text-sm text-gray-500">No email after a few minutes? Check your spam folder.</p>
          <Link href="/login">
            <Button className="w-full" size="lg">Go to log in</Button>
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      active="signup"
      headline="Turn your class notes into practice questions."
      subtext="Upload a lecture PDF. Get a timed quiz and a tutor that explains in simple words."
      heading="Create your account"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className={labelClass}>First name</label>
            <Input
              id="firstName"
              name="firstName"
              placeholder="First name"
              value={form.firstName}
              onChange={handleChange}
              required
              autoComplete="given-name"
            />
          </div>
          <div>
            <label htmlFor="lastName" className={labelClass}>Last name</label>
            <Input
              id="lastName"
              name="lastName"
              placeholder="Last name"
              value={form.lastName}
              onChange={handleChange}
              required
              autoComplete="family-name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>Email address</label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="email"
          />
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div>
            <span className={labelClass}>Type of school</span>
            <div className="grid grid-cols-3 gap-2">
              {INSTITUTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => chooseType(type)}
                  aria-pressed={form.institutionType === type}
                  className={cn(
                    "min-h-12 px-2 py-2 rounded-xl border text-sm font-medium leading-tight transition-colors",
                    form.institutionType === type
                      ? "bg-primary text-white border-primary"
                      : "bg-card border-border text-foreground hover:border-primary/40"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="institution" className={labelClass}>School name</label>
            <SearchableSelect
              id="institution"
              title="Choose your school"
              value={form.institution}
              onChange={(v) => {
                setForm({ ...form, institution: v })
                setError(null)
              }}
              options={schoolList}
              disabled={!form.institutionType}
              allowCustom
              placeholder={form.institutionType ? "Tap to choose your school" : "Choose the type of school first"}
              searchPlaceholder="Search your school"
            />
            {form.institutionType && (
              <p className="text-xs text-gray-400 mt-1.5">
                Not in the list? Search for it, then tap &ldquo;Use&rdquo; to add it yourself.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="department" className={labelClass}>Department</label>
            <DepartmentField
              id="department"
              value={form.department}
              onChange={(v) => {
                setForm({ ...form, department: v })
                setError(null)
              }}
            />
          </div>

          <div>
            <label htmlFor="level" className={labelClass}>Level</label>
            <div className="grid grid-cols-3 gap-2">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, level: lvl })
                    setError(null)
                  }}
                  aria-pressed={form.level === lvl}
                  className={cn(
                    "min-h-11 px-2 py-2 rounded-xl border text-sm font-medium transition-colors",
                    form.level === lvl
                      ? "bg-primary text-white border-primary"
                      : "bg-card border-border text-foreground hover:border-primary/40"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="matricNumber" className={labelClass}>Matric number</label>
            <Input
              id="matricNumber"
              name="matricNumber"
              placeholder="e.g. 20/1234"
              value={form.matricNumber}
              onChange={handleChange}
              required
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <PasswordInput
              id="password"
              name="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={handleChange}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthShell>
  )
}
