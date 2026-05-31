// Core data types for Masoil Lubricantes Order Management System

export type Zona = "Norte" | "Capital" | "Sur" | "Oeste" | "GBA"

// 8 estados activos. Los valores legacy "EN_PREPARACION" y
// "ESPERANDO_MERCADERIA" todavía existen en el enum de Postgres (no se
// pueden DROP) y pueden aparecer en order_status_history como auditoría
// de pedidos viejos. statusConfig los soporta como lookup-only para
// renderizar el badge correctamente; el código nuevo NO los usa.
export type OrderStatus =
  | "BORRADOR"
  | "INGRESADO"
  | "FACTURADO"
  | "FACTURADO_PARCIAL"
  | "EN_PROCESO_ENTREGA"
  | "ENTREGADO"
  | "ENTREGADO_PARCIAL"
  | "CANCELADO"

export type ProductCategory = "Limpiadores" | "Lubricantes" | "Selladores" | "Belleza" | "Higiene"

export type UserRole = "admin" | "usuario"

export interface Product {
  id: string
  code: string
  name: string
  category: ProductCategory | null
  stock: number
  price: number
  isCustomizable: boolean
  customLeadTime: number // days
  lowStockThreshold: number
  criticalStockThreshold: number
  // GestionPro fields
  costoNeto?: number | null
  grupoRubro?: string | null
  ubicacion?: string | null
}

export interface OrderProduct {
  // id de la fila order_items (necesario para eliminar un item puntual,
  // ya que productId es null en lineas libre/descuento).
  id?: string
  productId: string
  productCode: string
  productName: string
  quantity: number
  price: number
  facturado?: boolean
  cantidadFacturada?: number
  facturaId?: number | null
  // tipo_linea distingue items reales del catalogo ("producto"), lineas
  // libres ad-hoc para productos no catalogados ("libre") y descuentos
  // generales con precio negativo ("descuento"). Default backend: "producto".
  tipoLinea?: "producto" | "libre" | "descuento"
}

export interface StatusChange {
  status: OrderStatus
  timestamp: Date
  userId: string
  userName: string
  notes?: string
}

export interface Order {
  id: string
  orderNumber: string
  clientId: string
  clientName: string
  vendedorId: string
  vendedorName: string
  zona: Zona
  status: OrderStatus
  products: OrderProduct[]
  total: number
  notes: string
  isCustom: boolean
  estimatedDelivery: Date
  createdAt: Date
  updatedAt: Date
  statusHistory: StatusChange[]
  isUrgent: boolean
  razonSocial?: string
  esIncompleto?: boolean
  observacionesIncompleto?: string
}

export interface Client {
  id: string
  businessName: string
  contactName: string
  whatsapp: string
  email: string
  zona: Zona
  vendedorId: string
  address: string
  paymentTerms: string
  creditLimit: number
  notes: string
  lastOrderDate?: Date
  totalOrders: number
  // GestionPro fields
  condicionIva?: string | null
  condicionPago?: string | null
  localidad?: string | null
  vendedorGp?: string | null
  telefono?: string | null
  sucursal?: string | null
  cuit?: string | null
  numeroDocum?: string | null
  domicilioEntrega?: string | null
  sucursalEntrega?: string | null
  codigoGestionpro?: string | null
}

export interface Vendedor {
  id: string
  name: string
  email: string
  whatsapp: string
  zonas: Zona[]
  isActive: boolean
  role: UserRole
  iniciales?: string | null
}

export interface StatusConfig {
  status: OrderStatus
  icon: string
  color: string
  bgColor: string
  label: string
  description: string
}
