import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"

interface StatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: string
  trendUp?: boolean
  href?: string
}

export function StatsCard({ title, value, icon: Icon, trend, trendUp, href }: StatsCardProps) {
  const content = (
    <Card className={cn("p-6", href && "hover:shadow-md transition-shadow cursor-pointer")}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
          {trend && (
            <p className={cn("text-xs mt-2", trendUp ? "text-green-600" : "text-red-600")}>
              {trendUp ? "↑" : "↓"} {trend}
            </p>
          )}
        </div>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
