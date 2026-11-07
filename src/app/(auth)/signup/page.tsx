// PATH: src/app/(auth)/signup/page.tsx
// Sign up and log in are now the same thing: "Continue with Google".
import { redirect } from "next/navigation"

export default function SignUpPage() {
  redirect("/login")
}
