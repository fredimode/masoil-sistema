import type { StatusConfig, OrderStatus } from "./types"

// Record<string, ...> en lugar de Record<OrderStatus, ...> para soportar
// lookup de valores legacy ("EN_PREPARACION", "ESPERANDO_MERCADERIA") que
// pueden aparecer en order_status_history aunque ya no estén en el enum
// de TypeScript. Sprint H: el flow nuevo usa solo los 8 estados activos.
export const statusConfig: Record<string, StatusConfig> = {
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
  ENTREGADO: {
    status: "ENTREGADO",
    icon: "✅",
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
    label: "Entregado",
    description: "Entregado al cliente",
  },
  ENTREGADO_PARCIAL: {
    status: "ENTREGADO_PARCIAL" as OrderStatus,
    icon: "📦",
    color: "text-lime-700",
    bgColor: "bg-lime-50 border-lime-200",
    label: "Entregado Parcial",
    description: "Mercadería entregada parcialmente al cliente",
  },
  CANCELADO: {
    status: "CANCELADO",
    icon: "❌",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    label: "Cancelado",
    description: "Pedido cancelado",
  },
  // ─── Legacy (no usados en flow nuevo, lookup-only para historial) ───
  EN_PREPARACION: {
    status: "EN_PREPARACION" as OrderStatus,
    icon: "📦",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
    label: "En preparación (legacy)",
    description: "Estado obsoleto — aparece en historial de pedidos viejos.",
  },
  ESPERANDO_MERCADERIA: {
    status: "ESPERANDO_MERCADERIA" as OrderStatus,
    icon: "⏳",
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
    label: "Esperando Mercadería (legacy)",
    description: "Estado obsoleto — aparece en historial de pedidos viejos.",
  },
}

// Transiciones válidas para el flow nuevo (8 estados). Sprint H elimina
// EN_PREPARACION y ESPERANDO_MERCADERIA: INGRESADO ahora puede saltar
// directo a FACTURADO/FACTURADO_PARCIAL sin etapa intermedia obligatoria.
// EN_PROCESO_ENTREGA ahora puede ir a ENTREGADO o ENTREGADO_PARCIAL.
export const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  BORRADOR: ["INGRESADO", "CANCELADO"],
  INGRESADO: ["FACTURADO", "FACTURADO_PARCIAL", "CANCELADO"],
  FACTURADO_PARCIAL: ["FACTURADO", "EN_PROCESO_ENTREGA", "CANCELADO"],
  FACTURADO: ["EN_PROCESO_ENTREGA", "CANCELADO"],
  EN_PROCESO_ENTREGA: ["ENTREGADO", "ENTREGADO_PARCIAL", "CANCELADO"],
  ENTREGADO_PARCIAL: ["ENTREGADO", "CANCELADO"],
  ENTREGADO: [],
  CANCELADO: [],
}

export function getStatusConfig(status: OrderStatus | string): StatusConfig {
  return statusConfig[status] || statusConfig.INGRESADO
}

export function getNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return validTransitions[currentStatus] || []
}
