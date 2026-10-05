import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import { formatBcvRate, normalizarTasa } from './rates.js';

export { formatBcvRate, normalizarTasa };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tasasPath = path.resolve(process.env.RATE_FILE_PATH || path.join(__dirname, '..', 'tasas.json'));

const BCV_URL = 'https://www.bcv.org.ve/';
const HTTP_TIMEOUT_MS = 20000;
const RETRIES = 3;
const RETRY_DELAY_MS = 1500;

// La tasa se considera vencida a las 6h: BCV publica una vez al día,
// pero refrescar más seguido protege contra deploys e instancias dormidas.
export const MAX_RATE_AGE_MS = 6 * 60 * 60 * 1000;

const defaultRates = {
  tasa_usd: 852.41,
  tasa_eur: 978.17,
  tasa_usd_texto: '852,41',
  tasa_eur_texto: '978,17',
  moneda_activa: 'USD',
  // Un valor de respaldo no debe parecer recién actualizado: así Render
  // consulta al BCV incluso si acaba de crear el archivo en un disco vacío.
  ultima_actualizacion: new Date(0).toISOString()
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Serializa las escrituras de tasas.json para evitar carreras read-modify-write.
let writeQueue = Promise.resolve();
let inFlight = null;
let lastError = null;

async function ensureRatesFile() {
  try {
    await fs.access(tasasPath);
  } catch {
    await fs.mkdir(path.dirname(tasasPath), { recursive: true });
    await fs.writeFile(tasasPath, JSON.stringify(defaultRates, null, 2), 'utf8');
  }
}

export async function loadRates() {
  await ensureRatesFile();
  const raw = await fs.readFile(tasasPath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    const tasa_usd = Number(parsed.tasa_usd ?? defaultRates.tasa_usd);
    const tasa_eur = Number(parsed.tasa_eur ?? defaultRates.tasa_eur);
    return {
      ...defaultRates,
      ...parsed,
      tasa_usd,
      tasa_eur,
      // El texto publicado manda: si no existe (archivo viejo) se deriva del número.
      tasa_usd_texto: parsed.tasa_usd_texto || formatBcvRate(tasa_usd),
      tasa_eur_texto: parsed.tasa_eur_texto || formatBcvRate(tasa_eur),
      moneda_activa: String(parsed.moneda_activa || 'USD').toUpperCase(),
      ultima_actualizacion: parsed.ultima_actualizacion || defaultRates.ultima_actualizacion
    };
  } catch {
    await fs.writeFile(tasasPath, JSON.stringify(defaultRates, null, 2), 'utf8');
    return { ...defaultRates, tasa_usd_texto: formatBcvRate(defaultRates.tasa_usd), tasa_eur_texto: formatBcvRate(defaultRates.tasa_eur) };
  }
}

export async function saveRates(nextRates) {
  await ensureRatesFile();
  const write = writeQueue.catch(() => {}).then(async () => {
    const current = await loadRates();
    const tasa_usd = Number(nextRates.tasa_usd ?? current.tasa_usd ?? defaultRates.tasa_usd);
    const tasa_eur = Number(nextRates.tasa_eur ?? current.tasa_eur ?? defaultRates.tasa_eur);
    const merged = {
      ...defaultRates,
      ...current,
      ...nextRates,
      tasa_usd,
      tasa_eur,
      tasa_usd_texto: nextRates.tasa_usd_texto || (nextRates.tasa_usd != null ? formatBcvRate(tasa_usd) : current.tasa_usd_texto),
      tasa_eur_texto: nextRates.tasa_eur_texto || (nextRates.tasa_eur != null ? formatBcvRate(tasa_eur) : current.tasa_eur_texto),
      moneda_activa: String(nextRates.moneda_activa || current.moneda_activa || 'USD').toUpperCase(),
      ultima_actualizacion: nextRates.ultima_actualizacion || current.ultima_actualizacion || new Date().toISOString()
    };
    await fs.writeFile(tasasPath, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  });
  writeQueue = write.then(() => undefined, () => undefined);
  return write;
}

function parseMoneyNumber(rawValue) {
  if (!rawValue) return null;
  const normalized = String(rawValue).replace(/[^0-9,\.]/g, '').trim();
  if (!normalized) return null;
  if (normalized.includes(',') && normalized.includes('.')) {
    return Number(normalized.replace(/\./g, '').replace(',', '.'));
  }
  if (normalized.includes(',')) {
    return Number(normalized.replace(',', '.'));
  }
  return Number(normalized);
}

function extractBCVValue(html, currencyCode) {
  const $ = cheerio.load(html);
  const target = currencyCode === 'USD' ? 'USD' : 'EUR';

  const build = (raw) => {
    const value = parseMoneyNumber(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    // Se conserva el texto publicado para mostrarlo tal cual, sin que un
    // redondeo lo convierta en una tasa que el BCV nunca publicó.
    return { value, texto: normalizarTasa(raw) };
  };

  // Vía principal: el elemento exacto que el BCV pinta en pantalla.
  // Cada div lleva el nombre de la moneda y al lado <strong class="strong-tb">.
  let visible = null;
  $('strong.strong-tb').each((_, el) => {
    if (visible) return;
    const $parent = $(el).closest('div');
    const label = $parent.prev().find('span').first().text().trim().toUpperCase();
    if (label === target) visible = build($(el).text());
  });
  if (visible) return visible;

  // Respaldo: búsqueda en el texto plano por si cambian las clases CSS.
  const matchingText = $('body').text().replace(/\s+/g, ' ');
  const patterns = [
    new RegExp(`${target}[^0-9]{0,12}([0-9]{1,3}(?:\\.|,)?[0-9]{3}(?:\\.|,)?[0-9]{0,2})`, 'i'),
    new RegExp(`(?:DOLAR|Dólar|Dollar)[^0-9]{0,12}([0-9]{1,3}(?:\\.|,)?[0-9]{3}(?:\\.|,)?[0-9]{0,2})`, 'i'),
    new RegExp(`(?:EURO|Euro)[^0-9]{0,12}([0-9]{1,3}(?:\\.|,)?[0-9]{3}(?:\\.|,)?[0-9]{0,2})`, 'i')
  ];

  for (const pattern of patterns) {
    const match = matchingText.match(pattern);
    if (match) {
      const parsed = build(match[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

async function requestBcvHtml() {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const response = await axios.get(BCV_URL, {
        timeout: HTTP_TIMEOUT_MS,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; menu-pdwa/1.0)' }
      });
      const html = typeof response.data === 'string' ? response.data : '';
      if (response.status === 200 && html.length > 1000) return html;
      lastError = new Error(`BCV respondió HTTP ${response.status} con ${html.length} bytes`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < RETRIES) {
      console.warn(`BCV: intento ${attempt}/${RETRIES} falló (${lastError?.message}). Reintentando...`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError || new Error('No se pudo contactar al BCV');
}

// Falla de verdad si no se pudo obtener una tasa nueva: antes devolvía las
// viejas en silencio y el admin veía "actualizado" sin que hubiera pasado nada.
export async function fetchBCVRates() {
  const rawHtml = await requestBcvHtml();
  const usd = extractBCVValue(rawHtml, 'USD');
  const eur = extractBCVValue(rawHtml, 'EUR');

  if (!usd || !eur) {
    throw new Error(`El BCV respondió pero no se pudo leer la tasa (USD: ${usd?.texto || 'n/d'}, EUR: ${eur?.texto || 'n/d'})`);
  }

  lastError = null;
  return saveRates({
    tasa_usd: usd.value,
    tasa_eur: eur.value,
    tasa_usd_texto: usd.texto,
    tasa_eur_texto: eur.texto,
    ultima_actualizacion: new Date().toISOString()
  });
}

// Una sola petición a la vez: el botón, el arranque y el cron no se pisan.
export function refreshRates() {
  if (!inFlight) {
    inFlight = fetchBCVRates()
      .catch(error => {
        lastError = error.message;
        throw error;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export function getRateAgeMs(rates) {
  const updatedAt = Date.parse(rates?.ultima_actualizacion || '');
  return Number.isFinite(updatedAt) ? Date.now() - updatedAt : Infinity;
}

// Núcleo de la actualización automática: refresca por VIGENCIA, no por reloj.
// Si la tasa está vieja (arranque tras deploy, instancia que despertó, fallo previo) la trae.
export async function refreshIfStale(maxAgeMs = MAX_RATE_AGE_MS) {
  const rates = await loadRates();
  const ageMs = getRateAgeMs(rates);
  if (ageMs < maxAgeMs) {
    return { refreshed: false, stale: false, ageMs, rates };
  }
  try {
    const fresh = await refreshRates();
    console.log(`📈 Tasa BCV actualizada (edad previa: ${Math.round(ageMs / 60000)} min).`);
    return { refreshed: true, stale: true, ageMs, rates: fresh };
  } catch (error) {
    lastError = error.message;
    console.error('BCV: no se pudo refrescar la tasa:', error.message);
    return { refreshed: false, stale: true, ageMs, rates, error: error.message };
  }
}

export async function setActiveCurrency(currency) {
  const value = String(currency || 'USD').trim().toUpperCase();
  const safeCurrency = value === 'EUR' ? 'EUR' : 'USD';
  const current = await loadRates();
  const updated = {
    ...current,
    moneda_activa: safeCurrency,
    ultima_actualizacion: current.ultima_actualizacion || new Date().toISOString()
  };
  return saveRates(updated);
}

export function getRateStatus() {
  return { ultimo_error: lastError };
}

// El arranque es la red de seguridad: tras un deploy o un cold start,
// la tasa commiteada (852.41) se corrige sola sin que nadie pulse nada.
export function startBCVUpdater() {
  refreshIfStale()
    .then(result => {
      if (result.error) console.warn(`⚠️  Arrancando con tasa vencida: ${result.error}`);
    })
    .catch(error => console.error('BCV: fallo al verificar la tasa al arrancar:', error.message));

  // Cada hora, no una vez al día: una instancia que estuvo dormida se
  // recupera en menos de una hora en vez de esperar a las 6 AM.
  cron.schedule('7 * * * *', async () => {
    try {
      await refreshIfStale();
    } catch (error) {
      console.error('Error al actualizar tasas BCV:', error.message);
    }
  }, {
    timezone: 'America/Caracas'
  });
}