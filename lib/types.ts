// Core data types for Masoil Lubricantes Order Management System

export type Zona = "Norte" | "Capital" | "Sur" | "Oeste" | "GBA"

export type OrderStatus =
  | "INGRESADO"
  | "PREPARADO"
  | "FACTURADO"
  | "ESPERANDO_MERCADERIA"
  | "ENTREGADO"
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
  productId: string
  productCode: string
  productName: string
  quantity: number
  price: number
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
}

export interface Vendedor {
  id: string
  name: string
  email: string
  whatsapp: string
  zonas: Zona[]
  isActive: boolean
  role: UserRole
}

export interface StatusConfig {
  status: OrderStatus
  icon: string
  color: string
  bgColor: string
  label: string
  description: string
}
