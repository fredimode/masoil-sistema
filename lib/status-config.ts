import type { StatusConfig, OrderStatus } from "./types"

export const statusConfig: Record<OrderStatus, StatusConfig> = {
  INGRESADO: {
    status: "INGRESADO",
    icon: "📥",
    color: "text-teal-700",
    bgColor: "bg-teal-50 border-teal-200",
    label: "Ingresado",
    description: "Pedido recibido del vendedor",
  },
  PREPARADO: {
    status: "PREPARADO",
    icon: "📦",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
    label: "Preparado",
    description: "Mercadería lista en depósito",
  },
  FACTURADO: {
    status: "FACTURADO",
    icon: "📄",
    color: "text-purple-700",
    bgColor: "bg-purple-50 border-purple-200",
    label: "Facturado",
    description: "Factura emitida",
  },
  ESPERANDO_MERCADERIA: {
    status: "ESPERANDO_MERCADERIA",
    icon: "⏳",
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
    label: "Esperando Mercadería",
    description: "Esperando mercadería del proveedor",
  },
  ENTREGADO: {
    status: "ENTREGADO",
    icon: "✅",
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
    label: "Entregado",
    description: "Entregado al cliente",
  },
  CANCELADO: {
    status: "CANCELADO",
    icon: "❌",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    label: "Cancelado",
    description: "Pedido cancelado",
  },
}

// Valid transitions map
export const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  INGRESADO: ["PREPARADO", "ESPERANDO_MERCADERIA", "CANCELADO"],
  PREPARADO: ["FACTURADO", "CANCELADO"],
  FACTURADO: ["ENTREGADO", "ESPERANDO_MERCADERIA", "CANCELADO"],
  ESPERANDO_MERCADERIA: ["PREPARADO", "CANCELADO"],
  ENTREGADO: [],
  CANCELADO: [],
}

export function getStatusConfig(status: OrderStatus): StatusConfig {
  return statusConfig[status] || statusConfig.INGRESADO
}

export function getNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return validTransitions[currentStatus] || []
}
