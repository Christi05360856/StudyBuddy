// PATH: src/app/(dashboard)/profile/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, LogOut } from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { APP_VERSION } from "@/lib/app-info"
import { LEVELS, cleanDepartment } from "@/lib/departments"
import { DepartmentField } from "@/components/department-field"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { startOnboardingTour } from "@/components/onboarding-tour"

type ProfileData = {
  full_name: string
  matric_number: string
  institution: string
  department: string | null
  level: string | null
  created_at: string
}

function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-border last:border-b-0">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right break-words min-w-0">
        {value}
      </span>
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [editing, setEditing] = useState(false)
  const [dept, setDept] = useState("")
  const [level, setLevel] = useState("")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      setEmail(user.email ?? "")

      const { data } = await supabase
        .from("profiles")
        .select("full_name, matric_number, institution, department, level, created_at")
        .eq("id", user.id)
        .single()

      if (data) {
        // Older accounts may have "Other" saved: treat it as not set so they can enter the real one
        const savedDept = data.department === "Other" ? null : data.department
        setProfile({ ...data, department: savedDept })
        setDept(savedDept ?? "")
        setLevel(data.level ?? "")
      }
      setLoading(false)
    }
    load()
  }, [])

  const logOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const saveExtras = async () => {
    const department = cleanDepartment(dept)
    if (!department || !level) {
      setEditError("Please choose or type your department, and choose your level.")
      return
    }
    setSaving(true)
    setEditError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from("profiles")
      .update({ department, level })
      .eq("id", user.id)

    if (error) {
      setEditError("Could not save. Please try again.")
      setSaving(false)
      return
    }

    setProfile((p) => (p ? { ...p, department, level } : p))
    setEditing(false)
    setSaving(false)
  }

  const registeredOn = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "-"

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-5 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">My profile</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : !profile ? (
          <p className="text-center text-gray-500 py-16">Could not load your profile.</p>
        ) : (
          <>
            <div className="flex flex-col items-center mb-6">
              <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center text-2xl font-bold text-foreground mb-3">
                {getInitials(profile.full_name)}
              </div>
              <h2 className="text-xl font-bold text-center">{profile.full_name}</h2>
            </div>

            <div className="rounded-2xl bg-card border border-border px-4 mb-4">
              <Row label="Full name" value={profile.full_name} />
              <Row label="Matric number" value={profile.matric_number} />
              <Row label="Email" value={email || "-"} />
              <Row label="School" value={profile.institution} />
              <Row label="Department" value={profile.department || "Not set"} />
              <Row label="Level" value={profile.level || "Not set"} />
              <Row label="Registered on" value={registeredOn} />
              <Row label="App version" value={APP_VERSION} />
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 mb-4 space-y-3">
              <p className="text-sm font-medium">Appearance</p>
              <ThemeToggle />
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 mb-4 space-y-2">
              <p className="text-sm font-medium">Help</p>
              <p className="text-xs text-gray-500">
                Short walkthrough of Home, Courses, Tutor, share and study music.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => startOnboardingTour()}
              >
                Replay app tour
              </Button>
            </div>

            {(!profile.department || !profile.level || editing) && (
              <div className="rounded-2xl border border-border bg-card p-4 mb-4 space-y-3">
                <p className="text-sm font-medium">
                  {profile.department && profile.level ? "Update department & level" : "Add department & level"}
                </p>
                <DepartmentField
                  id="profile-department"
                  value={dept}
                  onChange={(v) => {
                    setDept(v)
                    setEditError(null)
                  }}
                />
                <div className="grid grid-cols-3 gap-2">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setLevel(lvl)
                        setEditError(null)
                      }}
                      className={cn(
                        "min-h-10 px-2 py-1.5 rounded-xl border text-sm font-medium transition-colors",
                        level === lvl
                          ? "bg-primary text-white border-primary"
                          : "bg-card border-border text-foreground"
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                {editError && <p className="text-sm text-danger">{editError}</p>}
                <div className="flex gap-2">
                  {editing && (
                    <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  )}
                  <Button className="flex-1" disabled={saving} onClick={saveExtras}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}

            {profile.department && profile.level && !editing && (
              <Button variant="outline" className="w-full mb-4" onClick={() => setEditing(true)}>
                Edit department & level
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={logOut}
              disabled={signingOut}
            >
              <LogOut size={18} />
              {signingOut ? "Logging out..." : "Log out"}
            </Button>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
