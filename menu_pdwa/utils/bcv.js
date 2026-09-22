import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tasasPath = path.join(__dirname, '..', 'tasas.json');

const defaultRates = {
  tasa_usd: 852.41,
  tasa_eur: 978.17,
  moneda_activa: 'USD',
  ultima_actualizacion: new Date().toISOString()
};

async function ensureRatesFile() {
  try {
    await fs.access(tasasPath);
  } catch {
    await fs.writeFile(tasasPath, JSON.stringify(defaultRates, null, 2), 'utf8');
  }
}

export async function loadRates() {
  await ensureRatesFile();
  const raw = await fs.readFile(tasasPath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultRates,
      ...parsed,
      tasa_usd: Number(parsed.tasa_usd ?? defaultRates.tasa_usd),
      tasa_eur: Number(parsed.tasa_eur ?? defaultRates.tasa_eur),
      moneda_activa: String(parsed.moneda_activa || 'USD').toUpperCase(),
      ultima_actualizacion: parsed.ultima_actualizacion || new Date().toISOString()
    };
  } catch {
    await fs.writeFile(tasasPath, JSON.stringify(defaultRates, null, 2), 'utf8');
    return { ...defaultRates };
  }
}

export async function saveRates(nextRates) {
  await ensureRatesFile();
  const merged = {
    ...defaultRates,
    ...(await loadRates()),
    ...nextRates,
    tasa_usd: Number(nextRates.tasa_usd ?? defaultRates.tasa_usd),
    tasa_eur: Number(nextRates.tasa_eur ?? defaultRates.tasa_eur),
    moneda_activa: String(nextRates.moneda_activa || 'USD').toUpperCase(),
    ultima_actualizacion: nextRates.ultima_actualizacion || new Date().toISOString()
  };
  await fs.writeFile(tasasPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
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
  const matchingText = $('body').text().replace(/\s+/g, ' ');
  const target = currencyCode === 'USD' ? 'USD' : 'EUR';
  const patterns = [
    new RegExp(`${target}[^0-9]{0,12}([0-9]{1,3}(?:\\.|,)?[0-9]{3}(?:\\.|,)?[0-9]{0,2})`, 'i'),
    new RegExp(`(?:DOLAR|Dólar|Dollar)[^0-9]{0,12}([0-9]{1,3}(?:\\.|,)?[0-9]{3}(?:\\.|,)?[0-9]{0,2})`, 'i'),
    new RegExp(`(?:EURO|Euro)[^0-9]{0,12}([0-9]{1,3}(?:\\.|,)?[0-9]{3}(?:\\.|,)?[0-9]{0,2})`, 'i')
  ];

  for (const pattern of patterns) {
    const match = matchingText.match(pattern);
    if (match) {
      const value = parseMoneyNumber(match[1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  return null;
}

export async function fetchBCVRates() {
  const response = await axios.get('https://www.bcv.org.ve/', {
    timeout: 30000,
    httpsAgent: { rejectUnauthorized: false },
    validateStatus: () => true
  });

  const rawHtml = response.data || '';
  const usdValue = extractBCVValue(rawHtml, 'USD');
  const eurValue = extractBCVValue(rawHtml, 'EUR');

  if (!usdValue || !eurValue) {
    const fallback = await loadRates();
    return fallback;
  }

  const nextRates = {
    tasa_usd: Number(usdValue),
    tasa_eur: Number(eurValue),
    moneda_activa: 'USD',
    ultima_actualizacion: new Date().toISOString()
  };

  return saveRates(nextRates);
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

export function startBCVUpdater() {
  cron.schedule('0 6 * * *', async () => {
    try {
      await fetchBCVRates();
      console.log('📈 Tasas BCV actualizadas correctamente.');
    } catch (error) {
      console.error('Error al actualizar tasas BCV:', error.message);
    }
  }, {
    timezone: 'America/Caracas'
  });
}
