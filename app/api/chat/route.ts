import { streamText, stepCountIs, convertToModelMessages } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { Resend } from "resend"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

async function buildSystemPrompt(): Promise<string> {
  const supabase = createServiceClient()

  // Fetch products summary
  const { data: products } = await supabase.from("products").select("category, stock, low_stock_threshold")
  const categoryMap: Record<string, { total: number; stockBajo: number }> = {}
  for (const p of products || []) {
    if (!categoryMap[p.category]) categoryMap[p.category] = { total: 0, stockBajo: 0 }
    categoryMap[p.category].total++
    if (p.stock < p.low_stock_threshold) categoryMap[p.category].stockBajo++
  }
  const productSummary = Object.entries(categoryMap)
    .map(([cat, { total, stockBajo }]) => `  ${cat}: ${total} productos${stockBajo > 0 ? ` (${stockBajo} con stock bajo)` : ""}`)
    .join("\n")

  // Fetch orders summary
  const { data: orders } = await supabase.from("orders").select("status, is_urgent")
  const statusMap: Record<string, number> = {}
  let urgentCount = 0
  for (const o of orders || []) {
    statusMap[o.status] = (statusMap[o.status] || 0) + 1
    if (o.is_urgent && !["ENTREGADO", "CANCELADO"].includes(o.status)) urgentCount++
  }
  const orderSummary = Object.entries(statusMap)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join("\n")

  // Fetch clients summary
  const { data: clients } = await supabase.from("clients").select("zona")
  const zonaMap: Record<string, number> = {}
  for (const c of clients || []) {
    const z = c.zona || "Sin zona"
    zonaMap[z] = (zonaMap[z] || 0) + 1
  }
  const clientSummary = Object.entries(zonaMap)
    .map(([zona, count]) => `  ${zona}: ${count}`)
    .join("\n")

  // Fetch active vendedores count
  const { count: vendedorCount } = await supabase
    .from("vendedores")
    .select("id", { count: "exact", head: true })
    .eq("role", "vendedor")
    .eq("is_active", true)

  return `Sos el asistente interno de Masoil Lubricantes (distribuidora B2B, Argentina). Respondé siempre en español argentino. Respondé de forma concisa y directa. Máximo 2-3 oraciones salvo que el usuario pida detalle.

Usá las herramientas disponibles para consultar datos específicos (productos, pedidos, clientes). No inventes datos; si no tenés la info, usá un tool.

## Resumen del sistema
Productos (${(products || []).length} total):
${productSummary}

Pedidos (${(orders || []).length} total, ${urgentCount} urgentes):
${orderSummary}

Clientes (${(clients || []).length} total) por zona:
${clientSummary}

Vendedores activos: ${vendedorCount || 0}`
}

export async function POST(req: Request) {
  try {
  const { messages } = await req.json()
  const supabase = createServiceClient()

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: await buildSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      consultarStock: {
        description: "Consulta stock actual de un producto por nombre o código",
        inputSchema: z.object({
          producto: z.string().describe("Nombre o código del producto a buscar"),
        }),
        execute: async ({ producto }: { producto: string }) => {
          const { data: matches } = await supabase
            .from("products")
            .select("name, code, stock, price, category, low_stock_threshold, critical_stock_threshold")
            .or(`name.ilike.%${producto}%,code.ilike.%${producto}%`)

          if (!matches || matches.length === 0) {
            return { encontrado: false, mensaje: `No se encontró ningún producto que coincida con "${producto}"`, productos: [] as unknown[] }
          }

          return {
            encontrado: true,
            mensaje: `Se encontraron ${matches.length} producto(s)`,
            productos: matches.map((p) => ({
              nombre: p.name,
              codigo: p.code,
              stock: p.stock,
              precio: p.price,
              categoria: p.category,
              stockBajo: p.stock < p.low_stock_threshold,
              stockCritico: p.stock < p.critical_stock_threshold,
            })),
          }
        },
      },
      consultarPedidos: {
        description: "Consulta pedidos por nombre de cliente, estado o zona",
        inputSchema: z.object({
          query: z.string().describe("Nombre de cliente, estado del pedido (ej: RECIBIDO, EN_ARMADO, ENTREGADO) o zona"),
        }),
        execute: async ({ query }: { query: string }) => {
          const q = query.toUpperCase()

          // Try matching by status first, then by client name or zona
          let matches: any[] = []
          const { data: byStatus } = await supabase
            .from("orders")
            .select("id, client_name, vendedor_name, zona, status, total, is_urgent, created_at, order_items(id)")
            .eq("status", q)
            .limit(10)

          if (byStatus && byStatus.length > 0) {
            matches = byStatus
          } else {
            const { data: byName } = await supabase
              .from("orders")
              .select("id, client_name, vendedor_name, zona, status, total, is_urgent, created_at, order_items(id)")
              .or(`client_name.ilike.%${query}%,vendedor_name.ilike.%${query}%,zona.ilike.%${query}%`)
              .limit(10)
            matches = byName || []
          }

          if (matches.length === 0) {
            return { encontrados: 0, mensaje: `No se encontraron pedidos para "${query}"`, pedidos: [] as unknown[] }
          }

          return {
            encontrados: matches.length,
            mensaje: `Se encontraron ${matches.length} pedido(s)`,
            pedidos: matches.map((o: any) => ({
              id: o.id,
              cliente: o.client_name,
              vendedor: o.vendedor_name,
              zona: o.zona,
              estado: o.status,
              total: o.total,
              urgente: o.is_urgent,
              productos: (o.order_items || []).length,
              fecha: new Date(o.created_at).toLocaleDateString("es-AR"),
            })),
          }
        },
      },
      enviarEmail: {
        description: "Envía un email a un destinatario",
        inputSchema: z.object({
          destinatario: z.string().describe("Email del destinatario"),
          asunto: z.string().describe("Asunto del email"),
          cuerpo: z.string().describe("Contenido del email"),
        }),
        execute: async ({ destinatario, asunto, cuerpo }: { destinatario: string; asunto: string; cuerpo: string }) => {
          if (!process.env.RESEND_API_KEY) {
            return { enviado: false, mensaje: "RESEND_API_KEY no configurada. No se pudo enviar el email." }
          }
          try {
            const resend = new Resend(process.env.RESEND_API_KEY)
            const { error } = await resend.emails.send({
              from: "Masoil Sistema <onboarding@resend.dev>",
              to: destinatario,
              subject: asunto,
              html: cuerpo,
            })
            if (error) {
              return { enviado: false, mensaje: `Error al enviar: ${error.message}` }
            }
            return { enviado: true, mensaje: `Email enviado correctamente a ${destinatario}` }
          } catch (err) {
            return { enviado: false, mensaje: `Error al enviar email: ${err instanceof Error ? err.message : "desconocido"}` }
          }
        },
      },
    },
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("Chat API error:", error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
