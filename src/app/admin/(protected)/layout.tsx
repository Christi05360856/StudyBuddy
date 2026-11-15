// PATH: src/app/admin/(protected)/layout.tsx
import { redirect } from "next/navigation"
import { isAdminRequest } from "@/lib/admin/session"

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await isAdminRequest())) {
    redirect("/admin/login")
  }
  return <>{children}</>
}
