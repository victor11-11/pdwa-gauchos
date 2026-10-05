// El BCV publica la tasa con 4 decimales reales (en su HTML: 871,36890000).
// Aplicar toFixed(2) convierte 871,3689 en 871,37: una tasa que el BCV nunca
// publicó. Aquí se conserva la cifra tal cual aparece, truncando los decimales
// sobrantes y nunca aproximando hacia arriba.

export const BCV_DECIMALS = 4;

/**
 * Normaliza el texto publicado por el BCV a la forma "871,3689":
 * coma decimal, sin ceros sobrantes, y con al menos 2 decimales.
 */
export function normalizarTasa(texto, minDecimals = 2) {
  const crudo = String(texto ?? '').replace(/[^\d.,]/g, '').trim();
  if (!crudo) return '';

  let source = crudo;
  if (source.includes(',') && source.includes('.')) {
    source = source.replace(/\./g, '').replace(',', '.');
  } else if (source.includes(',')) {
    source = source.replace(',', '.');
  }

  const [entero, decimales = ''] = source.split('.');
  if (!entero && !decimales) return '';

  const minimo = Math.max(minDecimals, 0);
  const limpio = decimales.replace(/0+$/, '');
  const largo = Math.max(minimo, limpio.length);
  return `${entero || '0'},${limpio.padEnd(largo, '0')}`;
}

/**
 * Formatea un valor numérico como tasa BCV, sin redondear.
 * Úsala solo cuando no exista el texto original publicado.
 */
export function formatBcvRate(value, minDecimals = 2) {
  const numero = Number(value);
  if (!Number.isFinite(numero)) return '';
  return normalizarTasa(numero.toFixed(BCV_DECIMALS), minDecimals);
}