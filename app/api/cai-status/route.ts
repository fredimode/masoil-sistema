import { NextResponse } from "next/server"
import { getAllCaiHealth, shouldBlockOnExpired } from "@/lib/cai-status"

// Devuelve el estado de los CAI de cada empresa para que la UI muestre
// banners (vigente / por_vencer / vencido). Server-side: lee env vars
// con fallback hardcoded.
export async function GET() {
  return NextResponse.json({
    blockOnExpired: shouldBlockOnExpired(),
    items: getAllCaiHealth(),
  })
}
