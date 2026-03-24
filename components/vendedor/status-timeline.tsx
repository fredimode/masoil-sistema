import { getStatusConfig } from "@/lib/status-config"
import type { OrderStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

interface StatusTimelineProps {
  currentStatus: OrderStatus
  isCustom?: boolean
}

// Single linear flow for all orders now
const mainFlow: OrderStatus[] = ["INGRESADO", "PREPARADO", "FACTURADO", "ENTREGADO"]

export function StatusTimeline({ currentStatus }: StatusTimelineProps) {
  const currentIndex = mainFlow.indexOf(currentStatus)

  // Handle special statuses (not in the main flow)
  if (currentStatus === "ESPERANDO_MERCADERIA" || currentStatus === "CANCELADO") {
    const config = getStatusConfig(currentStatus)
    return (
      <div className="flex items-center justify-center p-4 bg-muted/50 rounded-lg">
        <div className={cn("flex items-center gap-2 text-sm font-medium", config.color)}>
          <span>{config.icon}</span>
          <span>{config.label}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 min-w-max pb-2">
        {mainFlow.map((status, index) => {
          const config = getStatusConfig(status)
          const isActive = index <= currentIndex
          const isCurrent = status === currentStatus

          return (
            <div key={status} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all",
                    isActive
                      ? `${config.bgColor} ${config.color} border-current`
                      : "bg-muted border-muted-foreground/20 text-muted-foreground/40",
                  )}
                >
                  <span className="text-sm">{config.icon}</span>
                </div>
                <span
                  className={cn(
                    "text-xs mt-1 whitespace-nowrap text-center font-medium",
                    isCurrent ? config.color : isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {config.label}
                </span>
              </div>
              {index < mainFlow.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-8 mx-1 transition-all",
                    isActive && index < currentIndex ? "bg-primary" : "bg-muted-foreground/20",
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
