// PATH: src/app/(dashboard)/layout.tsx

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The middleware already sends logged-out visitors to /login. This is a second lock.
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("institution, department, level")
    .eq("id", user.id)
    .maybeSingle()

  const department = profile?.department === "Other" ? "" : profile?.department
  if (!profile?.institution || !department || !profile?.level) {
    redirect("/onboarding")
  }

  return <>{children}</>
}
