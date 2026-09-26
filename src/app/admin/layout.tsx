import type { Metadata } from "next"
import { AdminSessionKeepAlive } from "./AdminSessionKeepAlive"

// Metadata override pour toutes les pages /admin/*.
// PS-05b — PWA admin séparée : manifest dédié (scope /admin/) + icône 🥘 distincte du
// panda cuisto client. Le manifest client (scope /) reste intact.
export const metadata: Metadata = {
  title: "Panda Snack · Admin",
  manifest: "/admin/manifest.webmanifest",
  icons: {
    icon: "/favicon-admin.svg",
    apple: "/icons/admin-apple-touch.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Admin PS",
  },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminSessionKeepAlive />
      {children}
    </>
  )
}
