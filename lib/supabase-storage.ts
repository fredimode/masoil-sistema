import { createServiceClient } from "@/lib/supabase/server"

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 // 1 año

export async function uploadFacturaToStorage(
  buffer: Buffer | Uint8Array,
  fileName: string,
  empresa: string
): Promise<string> {
  const supabase = createServiceClient()

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")

  const safeEmpresa = empresa
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  const path = `${safeEmpresa}/${year}/${month}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from("facturas")
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Error subiendo factura a Storage: ${uploadError.message}`)
  }

  const { data, error: signedError } = await supabase.storage
    .from("facturas")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (signedError || !data?.signedUrl) {
    throw new Error(
      `Error generando signedUrl: ${signedError?.message ?? "sin URL"}`
    )
  }

  return data.signedUrl
}
