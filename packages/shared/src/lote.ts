// ── Dominio: Lotes ──

export const LOTE_ESTADO = {
  ACTIVO: "activo",
  PAGADO: "pagado",
  VENCIDO: "vencido",
} as const;

export type LoteEstado = (typeof LOTE_ESTADO)[keyof typeof LOTE_ESTADO];

export interface Deudor {
  nombre: string;
  cedula?: string;
  telefono?: string;
}

export interface Lote {
  id: string;
  numero: string;
  estado: LoteEstado;
  monto?: number;
  fechaInscripcion?: string;
  fechaVencimiento?: string;
  producto?: Producto;
  deudor?: Deudor;
}

// ── Productos válidos (whitelist de la plataforma) ──
// Fuente: dropdown de /ec/participar scrapeado del HTML
export const PRODUCTOS_VALIDOS = [
  "Mini Ritz",
  "Ritz Jalapeño 75gr",
  "Ritz Jalapeño 180gr",
  "Ritz 20g",
  "Ritz queso 30g",
  "Ritz 52.5g",
  "Ritz 70g",
  "Ritz queso 75g",
  "Ritz 120g",
  "Ritz 180g",
] as const;

export type Producto = (typeof PRODUCTOS_VALIDOS)[number];

/**
 * Valida que un producto esté en la whitelist.
 * El servidor rechaza con 400 si el producto no coincide con el dropdown.
 */
export function esProductoValido(value: unknown): value is Producto {
  return (
    typeof value === "string" &&
    (PRODUCTOS_VALIDOS as readonly string[]).includes(value)
  );
}

/**
 * Valida el formato del lote: 2 letras + 9 dígitos.
 * El servidor rechaza con 400 cualquier otro formato.
 */
export function esFormatoLoteValido(value: string): boolean {
  return /^[A-Za-z]{2}\d{9}$/.test(value);
}