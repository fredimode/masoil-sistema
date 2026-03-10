import { streamText, stepCountIs, convertToModelMessages } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { Resend } from "resend"
import { z } from "zod"
// TODO: reemplazar import de mock-data por queries a Supabase
import { products, orders, clients, vendedores } from "@/lib/mock-data"

function buildSystemPrompt(): string {
  // Resumen por categoría de producto
  const categoryMap: Record<string, { total: number; stockBajo: number }> = {}
  for (const p of products) {
    if (!categoryMap[p.category]) categoryMap[p.category] = { total: 0, stockBajo: 0 }
    categoryMap[p.category].total++
    if (p.stock < p.lowStockThreshold) categoryMap[p.category].stockBajo++
  }
  const productSummary = Object.entries(categoryMap)
    .map(([cat, { total, stockBajo }]) => `  ${cat}: ${total} productos${stockBajo > 0 ? ` (${stockBajo} con stock bajo)` : ""}`)
    .join("\n")

  // Resumen de pedidos por estado
  const statusMap: Record<string, number> = {}
  for (const o of orders) {
    statusMap[o.status] = (statusMap[o.status] || 0) + 1
  }
  const orderSummary = Object.entries(statusMap)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join("\n")
  const urgentCount = orders.filter((o) => o.isUrgent && !["ENTREGADO", "CANCELADO"].includes(o.status)).length

  // Resumen de clientes por zona
  const zonaMap: Record<string, number> = {}
  for (const c of clients) {
    zonaMap[c.zona] = (zonaMap[c.zona] || 0) + 1
  }
  const clientSummary = Object.entries(zonaMap)
    .map(([zona, count]) => `  ${zona}: ${count}`)
    .join("\n")

  // TODO: reemplazar mock-data por queries a Supabase

  return `Sos el asistente interno de Masoil Lubricantes (distribuidora B2B, Argentina). Respondé siempre en español argentino. Respondé de forma concisa y directa. Máximo 2-3 oraciones salvo que el usuario pida detalle.

Usá las herramientas disponibles para consultar datos específicos (productos, pedidos, clientes). No inventes datos; si no tenés la info, usá un tool.

## Resumen del sistema
Productos (${products.length} total):
${productSummary}

Pedidos (${orders.length} total, ${urgentCount} urgentes):
${orderSummary}

Clientes (${clients.length} total) por zona:
${clientSummary}

Vendedores activos: ${vendedores.filter((v) => v.role === "vendedor" && v.isActive).length}`
}

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic("claude-3-5-haiku-20241022"),
    system: buildSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      consultarStock: {
        description: "Consulta stock actual de un producto por nombre o código",
        inputSchema: z.object({
          producto: z.string().describe("Nombre o código del producto a buscar"),
        }),
        execute: async ({ producto }: { producto: string }) => {
          const query = producto.toLowerCase()
          const matches = products.filter(
            (p) =>
              p.name.toLowerCase().includes(query) ||
              p.code.toLowerCase().includes(query)
          )

          if (matches.length === 0) {
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
              stockBajo: p.stock < p.lowStockThreshold,
              stockCritico: p.stock < p.criticalStockThreshold,
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
          const matches = orders.filter(
            (o) =>
              o.clientName.toUpperCase().includes(q) ||
              o.status === q ||
              o.zona.toUpperCase() === q ||
              o.vendedorName.toUpperCase().includes(q)
          )

          if (matches.length === 0) {
            return { encontrados: 0, mensaje: `No se encontraron pedidos para "${query}"`, pedidos: [] as unknown[] }
          }

          return {
            encontrados: matches.length,
            mensaje: `Se encontraron ${matches.length} pedido(s)`,
            pedidos: matches.slice(0, 10).map((o) => ({
              id: o.id,
              cliente: o.clientName,
              vendedor: o.vendedorName,
              zona: o.zona,
              estado: o.status,
              total: o.total,
              urgente: o.isUrgent,
              productos: o.products.length,
              fecha: o.createdAt.toLocaleDateString("es-AR"),
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
}
