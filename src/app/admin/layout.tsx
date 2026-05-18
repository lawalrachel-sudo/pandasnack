import type { Metadata } from "next"

// Metadata override pour toutes les pages /admin/*.
// Favicon distinct (assiette terracotta) pour bookmark dashboard reconnaissable
// vs favicon client par défaut (logo Panda Snack défini dans src/app/icon.jpg).
export const metadata: Metadata = {
  title: "Panda Snack · Admin",
  icons: {
    icon: "/favicon-admin.svg",
    apple: "/favicon-admin.svg",
  },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
