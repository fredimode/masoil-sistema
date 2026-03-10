import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function getDaysRemaining(targetDate: Date): number {
  const today = new Date()
  const diff = targetDate.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function getStockStatus(stock: number, lowThreshold: number, criticalThreshold: number) {
  if (stock === 0) return "sin-stock"
  if (stock < criticalThreshold) return "critico"
  if (stock < lowThreshold) return "bajo"
  return "disponible"
}

export function formatMoney(value: number, currency: "ARS" | "USD" = "ARS", decimals: number = 2): string {
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDateStr(dateString: string | Date | null | undefined): string {
  if (!dateString || dateString === "" || dateString === "undefined" || dateString === "null") {
    return "-"
  }

  if (dateString instanceof Date) {
    if (isNaN(dateString.getTime())) return "-"
    const dia = String(dateString.getDate()).padStart(2, "0")
    const mes = String(dateString.getMonth() + 1).padStart(2, "0")
    return `${dia}/${mes}/${dateString.getFullYear()}`
  }

  if (typeof dateString === "string") {
    const trimmed = dateString.trim()

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-").map(Number)
      return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
    }

    // DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      return trimmed
    }

    // ISO with timestamp
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      const fechaParte = trimmed.split("T")[0]
      const [year, month, day] = fechaParte.split("-").map(Number)
      return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
    }

    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) {
      const dia = String(date.getDate()).padStart(2, "0")
      const mes = String(date.getMonth() + 1).padStart(2, "0")
      return `${dia}/${mes}/${date.getFullYear()}`
    }
  }

  return "-"
}
