// PATH: src/app/onboarding/page.tsx

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { DepartmentField } from "@/components/department-field"
import { cn } from "@/lib/utils"
import { INSTITUTION_TYPES, INSTITUTIONS, type InstitutionType } from "@/lib/institutions"
import { cleanDepartment, levelsFor } from "@/lib/departments"

const labelClass = "block text-sm font-medium text-foreground mb-1.5"

// Same safety check as login: stay inside our own app
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/home"
}

// Small wrapper that fades each new step in
function Step({ children }: { children: React.ReactNode }) {
  return <div className="animate-[fadeIn_0.25s_ease-out]">{children}</div>
}

export default function OnboardingPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [next, setNext] = useState("/home")
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState<InstitutionType | "">("")
  const [institution, setInstitution] = useState("")
  const [department, setDepartment] = useState("")
  const [level, setLevel] = useState("")

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get("next")))
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/login")
        return
      }
      const meta = user.user_metadata ?? {}
      setFullName(String(meta.full_name ?? meta.name ?? "").trim())

      // Already finished before? Go straight in.
      const { data: profile } = await supabase
        .from("profiles")
        .select("institution, department, level")
        .eq("id", user.id)
        .maybeSingle()
      if (profile?.institution && profile?.department && profile?.level) {
        router.replace("/home")
        return
      }
      setReady(true)
    })
  }, [router])

  const levels = type ? levelsFor(type) : []
  const showSchool = Boolean(type)
  const showDepartment = showSchool && Boolean(institution.trim())
  const showLevel = showDepartment && cleanDepartment(department).length > 0

  const chooseType = (t: InstitutionType) => {
    if (t === type) return
    setType(t)
    setInstitution("") // the school list is different for each type
    // Keep the level only if it also exists for the new type
    if (!levelsFor(t).includes(level as never)) setLevel("")
    setError(null)
  }

  const finish = async () => {
    const dept = cleanDepartment(department)
    if (!type || !institution.trim() || !dept || !level) {
      setError("Please complete every step.")
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace("/login")
      return
    }

    // The database creates the profile row on first sign in, so normally we only fill in the school
    // details. If the row is missing for any reason, we create it. (The role is never sent from the
    // browser. It always defaults to "student".)
    const details = { institution: institution.trim(), department: dept, level }
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update(details)
      .eq("id", user.id)
      .select("id")

    let saveError = updateError
    if (!saveError && (!updated || updated.length === 0)) {
      const fallbackName = fullName || String(user.email ?? "").split("@")[0] || "Student"
      const { error: insertError } = await supabase
        .from("profiles")
        .insert({ id: user.id, full_name: fallbackName, ...details })
      saveError = insertError
    }

    if (saveError) {
      setError("Could not save your details. Please try again.")
      setSaving(false)
      return
    }
    router.replace(next)
    router.refresh()
  }

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading...</div>
  }

  const firstName = fullName.split(" ")[0]

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-bold">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Tell us where you study so we can show you classmates&apos; notes. Takes 20 seconds.
        </p>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-5">
          <div>
            <span className={labelClass}>Type of school</span>
            <div className="grid grid-cols-3 gap-2">
              {INSTITUTION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => chooseType(t)}
                  aria-pressed={type === t}
                  className={cn(
                    "min-h-12 px-2 py-2 rounded-xl border text-sm font-medium leading-tight transition-colors",
                    type === t
                      ? "bg-primary text-white border-primary"
                      : "bg-card border-border text-foreground hover:border-primary/40"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {showSchool && (
            <Step>
              <label htmlFor="institution" className={labelClass}>School name</label>
              <SearchableSelect
                id="institution"
                title="Choose your school"
                value={institution}
                onChange={(v) => {
                  setInstitution(v)
                  setError(null)
                }}
                options={INSTITUTIONS[type as InstitutionType]}
                allowCustom
                placeholder="Tap to choose your school"
                searchPlaceholder="Search your school"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Not in the list? Search for it, then tap &ldquo;Use&rdquo; to add it yourself.
              </p>
            </Step>
          )}

          {showDepartment && (
            <Step>
              <label htmlFor="department" className={labelClass}>Department</label>
              <DepartmentField
                id="department"
                value={department}
                onChange={(v) => {
                  setDepartment(v)
                  setError(null)
                }}
              />
            </Step>
          )}

          {showLevel && (
            <Step>
              <span className={labelClass}>Level</span>
              <div className={cn("grid gap-2", levels.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
                {levels.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      setLevel(lvl)
                      setError(null)
                    }}
                    aria-pressed={level === lvl}
                    className={cn(
                      "min-h-11 px-2 py-2 rounded-xl border text-sm font-medium transition-colors",
                      level === lvl
                        ? "bg-primary text-white border-primary"
                        : "bg-card border-border text-foreground hover:border-primary/40"
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </Step>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <Button className="w-full mt-5" size="lg" disabled={saving || !level} onClick={finish}>
          {saving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </div>
  )
}
