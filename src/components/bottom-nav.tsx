// PATH: src/components/bottom-nav.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Home, BookOpen, Sparkles, BarChart3, User } from "lucide-react"

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/tutor", label: "AI Tutor", icon: Sparkles },
  { href: "/progress", label: "Progress", icon: BarChart3 },
]

// On phones this is a bar at the bottom.
// On laptops and desktops (lg and up) it becomes a side bar on the left.
export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      data-app-nav
      className="fixed z-40 bottom-0 left-0 right-0 bg-card border-t border-border safe-area-pb lg:top-0 lg:right-auto lg:w-60 lg:border-t-0 lg:border-r lg:flex lg:flex-col lg:px-4 lg:py-6"
    >
      {/* Logo (side bar only) */}
      <Link href="/home" className="hidden lg:flex items-center gap-2 px-2 mb-8">
        <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2.5">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
        </span>
        <span className="text-lg font-semibold">StudyBuddy</span>
      </Link>

      <div className="max-w-md mx-auto flex items-stretch justify-around h-16 lg:max-w-none lg:mx-0 lg:h-auto lg:flex-col lg:justify-start lg:gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                "lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:text-sm lg:px-3 lg:py-2.5 lg:rounded-xl",
                active ? "text-primary lg:bg-primary/10" : "text-gray-400 lg:hover:bg-muted"
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>

      {/* Profile link (side bar only; on phones the profile opens from the Home page) */}
      <Link
        href="/profile"
        className={cn(
          "hidden lg:flex items-center gap-3 mt-auto px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
          pathname.startsWith("/profile") ? "text-primary bg-primary/10" : "text-gray-400 hover:bg-muted"
        )}
      >
        <User size={22} />
        <span>My profile</span>
      </Link>
    </nav>
  )
}
