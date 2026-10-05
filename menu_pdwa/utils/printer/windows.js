// Provider de Windows.
//
// LIMITACION REAL Y DELIBERADAMENTE DECLARADA:
// Windows no tiene equivalente a `lp -o raw`. El comando `print` pasa los
// bytes por el driver de la impresora, y casi todos los drivers de Windows
// interpretan texto plano: el ESC/POS crudo llega corrupto o ignorado.
//
// Por eso este provider:
//   - SÍ detecta e inventaria las impresoras instaladas.
//   - SÍ permite probar el envio, pero reporta si el formato es compatible.
//   - NO promete ESC/POS crudo nativo.
//
// Para ESC/POS crudo en Windows las vias reales son:
//   1. Compartir la impresora desde una maquina Linux con CUPS (recomendado en
//      un restaurante: el agente local ya corre en Linux).
//   2. Instalar un driver de impresora termica que interprete ESC/POS.
//   3. Conectar por red y usar el spooler del servidor.
//
// Se declara esto en vez de fingir que funciona igual que en Linux.

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const EXEC_TIMEOUT_MS = 10000;

export const isWindowsProvider = () => process.platform === 'win32';

export const isAvailable = () => isWindowsProvider();

const runPowerShell = async (script) => {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }
    );
    return { ok: true, stdout: stdout || '' };
  } catch (error) {
    return { ok: false, stdout: '', error: error?.message || String(error) };
  }
};

/**
 * Inventario de impresoras de Windows.
 * Se pide JSON a Get-Printer para no depender del idioma del sistema.
 */
export async function listPrinters() {
  if (!isWindowsProvider()) return [];

  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    '$items = Get-Printer | Select-Object Name,PrinterStatus,Type,DriverName,PortName,Shared,Network',
    'ConvertTo-Json -InputObject @($items) -Compress'
  ].join('; ');

  const { ok, stdout } = await runPowerShell(script);
  if (!ok || !stdout.trim()) return [];

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter(p => p && p.Name)
    .map(p => ({
      queue: String(p.Name),
      deviceUri: p.PortName ? String(p.PortName) : null,
      printerInfo: p.DriverName ? String(p.DriverName) : null,
      // En Windows no hay device-uri USB parseable: se marca por separado.
      kind: 'windows',
      isNetwork: Boolean(p.Network),
      isShared: Boolean(p.Shared),
      type: p.Type != null ? Number(p.Type) : null,
      // Impresora local fisica: es la candidata a termica de ticket.
      isLocal: !p.Network && !!p.PortName && /^(USB|LPT|COM|PORT_)/i.test(String(p.PortName)),
      // Honestidad: ESC/POS crudo no es fiable a traves del spooler de Windows.
      rawEscpos: false,
      rawEscposReason: 'Windows no envía ESC/POS crudo de forma fiable; requiere driver termico o impresora compartida.'
    }));
}

export async function getDefaultQueue() {
  const printers = await listPrinters();
  return printers[0]?.queue || null;
}

/** Estado de las colas, con la misma forma que devuelve el provider CUPS. */
export async function describeQueues() {
  const printers = await listPrinters();
  return printers.map(p => ({
    queue: p.queue,
    deviceUri: p.deviceUri,
    accepting: true,
    idle: true,
    stopped: false,
    pendingJobs: 0,
    completedJobs: 0,
    isDefault: false,
    binding: {
      status: p.isLocal ? 'connected' : 'network',
      device: p.isLocal
        ? {
            model: p.printerInfo || p.queue,
            manufacturer: null,
            product: p.printerInfo || p.queue,
            serial: null,
            vidPid: null,
            vendorLabel: null,
            kind: 'printer',
            interfaces: []
          }
        : null,
      reason: p.isLocal
        ? 'Impresora local conectada'
        : 'Impresora compartida o de red'
    },
    score: p.isLocal ? 40 : -10,
    signals: p.isLocal
      ? ['impresora local en Windows']
      : ['impresora compartida o de red'],
    rawEscpos: p.rawEscpos,
    rawEscposReason: p.rawEscposReason
  }));
}

/**
 * Envia un archivo a una impresora de Windows.
 * A diferencia de CUPS no se puede confirmar la impresion: el spooler acepta y
 * no informa. Se declara con printed: null (desconocido) en vez de true.
 */
export async function submitJob(queue, filePath) {
  const name = String(queue || '').trim();
  if (!name) return { ok: false, error: 'Nombre de impresora vacío' };

  try {
    const { stdout } = await execFileAsync('cmd.exe', ['/c', 'print', `/D:${name}`, filePath], {
      timeout: 20000,
      maxBuffer: 1024 * 1024
    });
    return { ok: true, jobId: null, stdout, confirmable: false };
  } catch (error) {
    return { ok: false, error: error?.message || 'print falló' };
  }
}

/** En Windows no se puede confirmar; se informa la incrtidumbre. */
export const confirmJob = async () => ({
  printed: null,
  unknown: true,
  reason: 'Windows no permite confirmar desde el spooler si el trabajo salió físicamente.'
});

export const cancelJobs = async () => ({ ok: false, error: 'No hay cancelacion por cola en Windows' });
export const provisionRawQueue = async () => ({ ok: false, error: 'Windows requiere instalar el driver de la impresora a mano' });
export const removeQueue = async () => ({ ok: false, error: 'No se pueden borrar colas desde aquí' });

export const sanitizeQueueName = (value) => {
  const text = String(value ?? '').trim();
  return text.length && text.length <= 127 ? text : null;
};