import type React from "react"
import { BottomNav } from "@/components/vendedor/bottom-nav"

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-16">
      {children}
      <BottomNav />
    </div>
  )
}
