// PATH: src/app/layout.tsx
import type { Metadata, Viewport } from "next"
import "./globals.css"
import { PwaSetup } from "@/components/pwa-setup"
import { MusicProvider } from "@/components/music/mini-player"

export const metadata: Metadata = {
  title: {
    default: "StudyBuddy NG",
    template: "%s · StudyBuddy NG",
  },
  description: "Study smarter from your own class notes",
  applicationName: "StudyBuddy NG",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "StudyBuddy",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
}

// viewportFit "cover" lets the app use the full screen on phones with a notch,
// and makes the safe-area padding in globals.css work.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3b5bdb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1117" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

// Runs before the first paint: picks the saved theme (or the phone's setting)
// so dark-mode users never see a white flash.
const themeScript = `(function(){try{var c=localStorage.getItem("sb_theme")||"system";var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <MusicProvider>
          {children}
        </MusicProvider>
        <PwaSetup />
      </body>
    </html>
  )
}
