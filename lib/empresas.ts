import type { Empresa } from "@/lib/tusfacturas"

export const EMPRESAS_DATA: Record<Empresa, {
  razonSocial: string
  cuit: string
  direccion: string
  localidad: string
  condicionIva: string
}> = {
  Aquiles: {
    razonSocial: "AQUILES EQUIPAMIENTOS SRL",
    cuit: "30-71514134-1",
    direccion: "Campichuelo 260 PB OF 23",
    localidad: "CAPITAL FEDERAL - BUENOS AIRES",
    condicionIva: "IVA RESP. INSCRIPTO",
  },
  Conancap: {
    razonSocial: "CONANCAP SRL",
    cuit: "30-71824287-4",
    direccion: "Campichuelo 260 PB OF 23",
    localidad: "CIUDAD AUTONOMA DE BUENOS AIRES",
    condicionIva: "IVA RESP. INSCRIPTO",
  },
}
