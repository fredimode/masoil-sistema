import { streamText, stepCountIs, convertToModelMessages } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
// TODO: reemplazar import de mock-data por queries a Supabase
import { products, orders, clients, vendedores } from "@/lib/mock-data"

function buildSystemPrompt(): string {
  const productList = products
    .map((p) => `- ${p.name} (${p.code}): stock ${p.stock}, $${p.price}, categoría ${p.category}${p.stock < p.criticalStockThreshold ? " ⚠️ CRÍTICO" : p.stock < p.lowStockThreshold ? " ⚠️ BAJO" : ""}`)
    .join("\n")

  const pendingOrders = orders
    .filter((o) => !["ENTREGADO", "CANCELADO"].includes(o.status))
    .map((o) => `- Pedido #${o.id}: ${o.clientName} (${o.zona}) - Estado: ${o.status} - Total: $${o.total}${o.isUrgent ? " 🔴 URGENTE" : ""}`)
    .join("\n")

  const clientList = clients
    .map((c) => `- ${c.businessName} (${c.zona}): contacto ${c.contactName}, ${c.totalOrders} pedidos, crédito $${c.creditLimit}`)
    .join("\n")

  const vendedorList = vendedores
    .filter((v) => v.role === "vendedor")
    .map((v) => `- ${v.name}: zonas ${v.zonas.join(", ")}${v.isActive ? "" : " (INACTIVO)"}`)
    .join("\n")

  const totalStock = products.reduce((s, p) => s + p.stock, 0)
  const criticalCount = products.filter((p) => p.stock < p.criticalStockThreshold && p.stock > 0).length
  const pendingCount = orders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(o.status)).length
  const urgentCount = orders.filter((o) => o.isUrgent && !["ENTREGADO", "CANCELADO"].includes(o.status)).length

  // TODO: inyectar stock actual, pedidos pendientes, alertas desde Supabase

  return `Sos el asistente interno del sistema de gestión de Masoil Lubricantes, una distribuidora B2B de lubricantes y productos industriales en Argentina. Ayudás a los usuarios del sistema con consultas sobre pedidos, stock, clientes y operaciones.

Respondé siempre en español argentino. Sé conciso y útil. Podés usar las herramientas disponibles para consultar datos del sistema.

## Resumen actual del sistema
- ${products.length} productos en catálogo (${totalStock} unidades totales en stock)
- ${criticalCount} productos con stock crítico
- ${pendingCount} pedidos pendientes (${urgentCount} urgentes)
- ${clients.length} clientes activos
- ${vendedores.filter((v) => v.role === "vendedor").length} vendedores activos

## Productos actuales
${productList}

## Pedidos pendientes
${pendingOrders || "No hay pedidos pendientes."}

## Clientes
${clientList}

## Vendedores
${vendedorList}`
}

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
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
          // TODO: integrar Resend
          console.log("Email solicitado:", { destinatario, asunto, cuerpo })
          return {
            enviado: false,
            mensaje: "Envío de emails pendiente de integración con Resend. El email fue registrado en los logs del servidor.",
          }
        },
      },
    },
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse()
}
