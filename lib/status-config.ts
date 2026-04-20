import type { StatusConfig, OrderStatus } from "./types"

export const statusConfig: Record<OrderStatus, StatusConfig> = {
  BORRADOR: {
    status: "BORRADOR",
    icon: "📝",
    color: "text-gray-700",
    bgColor: "bg-gray-100 border-gray-300",
    label: "Borrador",
    description: "Pedido en preparación (no enviado)",
  },
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
  FACTURADO_PARCIAL: {
    status: "FACTURADO_PARCIAL",
    icon: "📋",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50 border-indigo-200",
    label: "Facturado Parcial",
    description: "Factura parcial emitida",
  },
  FACTURADO: {
    status: "FACTURADO",
    icon: "📄",
    color: "text-purple-700",
    bgColor: "bg-purple-50 border-purple-200",
    label: "Facturado",
    description: "Factura emitida",
  },
  EN_PROCESO_ENTREGA: {
    status: "EN_PROCESO_ENTREGA",
    icon: "🚚",
    color: "text-cyan-700",
    bgColor: "bg-cyan-50 border-cyan-200",
    label: "En Proceso de Entrega",
    description: "Mercadería en camino al cliente",
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
  BORRADOR: ["INGRESADO", "CANCELADO"],
  INGRESADO: ["PREPARADO", "ESPERANDO_MERCADERIA", "CANCELADO"],
  PREPARADO: ["FACTURADO", "FACTURADO_PARCIAL", "CANCELADO"],
  FACTURADO_PARCIAL: ["FACTURADO", "CANCELADO"],
  FACTURADO: ["EN_PROCESO_ENTREGA", "CANCELADO"],
  EN_PROCESO_ENTREGA: ["ENTREGADO", "CANCELADO"],
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
