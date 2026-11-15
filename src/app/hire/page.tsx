// PATH: src/app/hire/page.tsx
import Link from "next/link"
import { APP_BRAND } from "@/lib/app-info"
import { ArrowLeft, MessageCircle } from "lucide-react"

export const metadata = {
  title: "Hire · PawsPatrol",
  description: "Work with Osoko Christian Excel — Software Engineer & Product Designer",
}

export default function HirePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-5 pt-8 pb-16">
        <Link
          href="/home"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-foreground mb-8"
        >
          <ArrowLeft size={16} />
          Back
        </Link>

        <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
              {APP_BRAND.studio}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{APP_BRAND.builderName}</h1>
            <p className="text-sm text-gray-500 mt-1">{APP_BRAND.builderRoles}</p>
          </div>

          <p className="text-sm leading-relaxed text-foreground/90">
            I design and build product-ready web apps — study tools, dashboards, and clean
            student-first experiences. {APP_BRAND.name} is one of them.
          </p>

          <div className="rounded-2xl bg-muted/80 p-4 space-y-3">
            <p className="text-sm font-medium">Let&apos;s talk</p>
            <a
              href={APP_BRAND.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 h-12 px-4 rounded-xl bg-[#25D366] text-white font-semibold text-sm"
            >
              <MessageCircle size={18} />
              WhatsApp · {APP_BRAND.whatsapp}
            </a>
            <a
              href={APP_BRAND.xLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center h-12 px-4 rounded-xl border border-border bg-card text-sm font-semibold hover:border-primary/40"
            >
              X · {APP_BRAND.xHandle}
            </a>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">{APP_BRAND.copyright}</p>
        </div>
      </div>
    </div>
  )
}
