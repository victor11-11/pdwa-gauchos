// API publica del subsistema de impresion.
//
// Aqui vive la logica que decide A DONDE se imprime, y es deliberadamente
// corta y legible:
//
//   1. Si quien llama pasa una cola explicita, se respeta.
//   2. Si el rol tiene un binding local, se usa SOLO si sigue siendo valido
//      (es decir, si el dispositivo sigue conectado de verdad).
//   3. Si no, se autodetecta la mejor impresora conectada.
//   4. Si no hay ninguna, se devuelve null con un motivo legible. La comanda no
//      se pierde: el pedido ya esta guardado en la base de datos.
//
// El punto 2 es el que evita el fallo que había antes: un binding puede
// quedar obsoleto cuando alguien desconecta la impresora, y en ese caso se
// ignora en vez de enviar el trabajo a una cola que nunca va a imprimir.

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import * as cups from './cups.js';
import * as windows from './windows.js';
import * as jobs from './jobs.js';
import { buildInventory, provisionDevice, getQueueHealth, invalidateInventory } from './selection.js';
import { generarComandaCocina, generarCuentaCliente, toEscPosBinary, buildKitchenTicket } from './ticket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const LOGICAL_CONFIG_PATH = path.join(ROOT, 'config', 'printers.json');
const LOCAL_BINDING_PATH = path.join(ROOT, 'printer.config.json');

const DEFAULT_LOGICAL = {
  printers: [
    { id: 'kitchen', label: 'Cocina', role: 'kitchen', enabled: true, requireConnected: true, sortOrder: 1 },
    { id: 'counter', label: 'Caja', role: 'receipt', enabled: true, requireConnected: false, sortOrder: 2 }
  ]
};

const VALID_ROLES = ['kitchen', 'receipt', 'bar', 'shipping', 'label', 'extras'];

// ---------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------

const readJson = async (file, fallback) => {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

/** Config logica (commiteada, portable). Si falta, se usan los roles por defecto. */
export async function readLogicalPrinters() {
  const raw = await readJson(LOGICAL_CONFIG_PATH, null);
  const list = Array.isArray(raw?.printers) ? raw.printers : DEFAULT_LOGICAL.printers;

  const cleaned = list
    .filter(p => p && p.id)
    .map(p => ({
      id: String(p.id).trim(),
      label: String(p.label || p.id).trim(),
      role: VALID_ROLES.includes(p.role) ? p.role : 'receipt',
      enabled: p.enabled !== false,
      requireConnected: p.requireConnected !== false,
      sortOrder: Number(p.sortOrder ?? 0) || 0
    }));

  return cleaned.sort((a, b) => a.sortOrder - b.sortOrder);
}

export const writeLogicalPrinters = async (printers) =>
  fs.writeFile(LOGICAL_CONFIG_PATH, `${JSON.stringify({ printers }, null, 2)}\n`, 'utf8');

/** Bindings locales (NO commiteados: son especificos de cada equipo). */
export async function readLocalBindings() {
  const raw = await readJson(LOCAL_BINDING_PATH, {});
  return raw.bindings && typeof raw.bindings === 'object' ? raw.bindings : {};
}

export async function writeLocalBindings(bindings) {
  const payload = { bindings, actualizado: new Date().toISOString() };
  await fs.writeFile(LOCAL_BINDING_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

// ---------------------------------------------------------------
// Provider por plataforma
// ---------------------------------------------------------------

const provider = process.platform === 'win32' ? windows : cups;
export const providerName = () => (process.platform === 'win32' ? 'windows' : 'cups');

// ---------------------------------------------------------------
// Resolucion de destino
// ---------------------------------------------------------------

/**
 * Decide la cola de destino para un rol. Devuelve ademas el motivo, para que
 * el panel pueda explicar por que se eligio o por que no hay destino.
 */
export async function resolveDestination(options = {}) {
  const role = options.role || options.id || null;
  const logical = role ? (await readLogicalPrinters()).find(p => p.id === role) : null;

  // 1) Cola explicita.
  if (options.queue) {
    const safe = provider.sanitizeQueueName?.(options.queue) ?? null;
    if (safe) return { queue: safe, logical, source: 'override', reason: 'Cola indicada explícitamente' };
  }

  const inventory = options.inventory || await buildInventory();

  // El rol puede estar deshabilitado: no se enruta a el.
  if (logical && !logical.enabled) {
    return { queue: null, logical, source: 'disabled', reason: `La impresora lógica "${logical.label}" está deshabilitada`, inventory };
  }

  const entryFor = (name) => inventory.printers.find(p => p.queue === name) || null;

  // 2) Variable de entorno PRINTER_NAME: la fijan por consola al arrancar el
  //    agente, asi que manda sobre el binding guardado en disco.
  const envQueue = provider.sanitizeQueueName?.(process.env.PRINTER_NAME || '') ?? null;
  if (!options.queue && envQueue) {
    const entry = entryFor(envQueue);
    if (!entry) {
      return {
        queue: null, logical, source: 'env-missing',
        reason: `PRINTER_NAME apunta a "${envQueue}" pero esa cola no existe en CUPS`,
        inventory
      };
    }
    if (entry.binding.status === 'connected' || !logical?.requireConnected) {
      return {
        queue: entry.queue, logical, source: 'env',
        reason: `Variable PRINTER_NAME="${envQueue}"`,
        entry, inventory
      };
    }
    const alternative = pickFromInventory(inventory);
    if (alternative) {
      return {
        queue: alternative.queue, logical, source: 'stale-fallback',
        reason: `AVISO: PRINTER_NAME="${envQueue}" no tiene dispositivo conectado. Se usa ${alternative.queue} en su lugar.`,
        warning: entry.binding.reason,
        entry: alternative, inventory, staleQueue: envQueue
      };
    }
    return {
      queue: null, logical, source: 'env-stale',
      reason: `PRINTER_NAME="${envQueue}" no está conectada y no hay alternativa`,
      inventory, staleQueue: envQueue
    };
  }

  // 3) Binding local, validado contra el hardware real.
  const bindings = await readLocalBindings();
  const bound = logical ? bindings[logical.id] : null;
  if (bound?.queue) {
    const entry = entryFor(bound.queue);
    if (!entry) {
      return {
        queue: null, logical, source: 'binding-missing',
        reason: `La cola "${bound.queue}" ya no existe en CUPS`,
        inventory
      };
    }
    const connected = entry.binding.status === 'connected';
    if (!connected && logical.requireConnected) {
      // El binding esta obsoleto: la impresora asignada no esta conectada.
      // Esto es justamente lo que pasaba con la Xpriner desconectada.
      //
      // No se devuelve null a secas: el pedido ya esta guardado, pero perder
      // la comanda entera porque alguien desconecto un cable es peor que
      // imprimir en otra impresora. Se cae a la mejor disponible y se avisa,
      // para que el panel lo muestre como algo a corregir.
      const alternative = pickFromInventory(inventory);
      if (alternative) {
        return {
          queue: alternative.queue, logical, source: 'stale-fallback',
          reason: `AVISO: la impresora de "${logical.label}" (${bound.queue}) no está conectada. Se usa ${alternative.queue} en su lugar.`,
          warning: entry.binding.reason,
          entry: alternative,
          inventory,
          staleQueue: bound.queue
        };
      }
      return {
        queue: null, logical, source: 'binding-stale',
        reason: `La impresora asignada a "${logical.label}" (${bound.queue}) no está conectada y no hay ninguna otra disponible: ${entry.binding.reason}`,
        inventory, staleQueue: bound.queue, candidate: null
      };
    }
    return { queue: entry.queue, logical, source: 'binding', reason: `Enlazada a la cola "${entry.queue}"`, entry, inventory };
  }

  // 4) Autodetección: la mejor impresora conectada, ya viene ordenada por
  //    puntaje y con la presencia del dispositivo como criterio dominante.
  const picked = pickFromInventory(inventory);
  if (picked) {
    return { queue: picked.queue, logical, source: 'auto', reason: `Detectada automáticamente: ${picked.binding?.device?.model || picked.queue}`, entry: picked, inventory };
  }

  // 5) Una impresora de red puede servir si el rol no exige USB conectada, pero
//    solo si hay pruebas de que acepta tickets: mandarle ESC/POS crudo a una
//    impresora de chorro de tinta no da error, da papel lleno de caracteres
//    raros, y eso se reporta como "la impresora falla".
  if (logical && logical.requireConnected === false) {
    const red = inventory.printers.find(p => p.binding.status === 'network' && p.termica?.termica !== false);
    if (red) {
      return {
        queue: red.queue,
        logical,
        source: 'fallback',
        reason: `Solo hay una impresora de red: "${red.queue}"${red.termica?.certeza === 'declarada' ? ' (descrita como ticketera)' : ''}`,
        warning: red.termica?.certeza === 'dudosa' ? 'No se pudo confirmar que sea una ticketera: haz una prueba de impresión.' : null,
        entry: red,
        inventory
      };
    }
  }

  return {
    queue: null, logical, source: 'none',
    reason: inventory.note || 'No hay ninguna impresora disponible en este equipo',
    inventory
  };
}

const pickFromInventory = (inventory) =>
  (inventory?.printers || []).find(p => p.binding.status === 'connected') || null;

// ---------------------------------------------------------------
// Envio
// ---------------------------------------------------------------

const writeTempTicket = async (buffer) => {
  const file = path.join(os.tmpdir(), `ticket_${Date.now()}_${Math.random().toString(16).slice(2)}.bin`);
  await fs.writeFile(file, buffer);
  return file;
};

/**
 * Envia un ticket a un rol y devuelve un trabajo con estado real.
 *
 * `confirm`:
 *   'wait'       -> espera a que salga de la cola y devuelve si se imprimio
 *   'background' -> responde ya y confirma despues (uso normal en el POS)
 *   'none'       -> no confirma
 */
export async function printTicket({ role = 'kitchen', ticketType = null, order = {}, confirm = 'background', queue = null, confirmTimeoutMs, name = null } = {}) {
  const ticketOptions = { restaurantName: businessName(name) };
  const ticket = ticketType === 'receipt'
    ? generarCuentaCliente(order, ticketOptions)
    : generarComandaCocina(order, ticketOptions);

  const result = await printBytes({
    bytes: toEscPosBinary(ticket),
    role,
    queue,
    confirm,
    confirmTimeoutMs,
    ticketType: ticketType || (role === 'counter' ? 'receipt' : 'kitchen'),
    orderId: order?.id ?? null
  });

  // El texto del ticket se conserva en la respuesta para que quien llama pueda
  // guardarlo o mostrarlo si no hay impresora.
  return { ...result, ticket };
}

/**
 * Núcleo del envío: recibe los bytes ya listos y se encarga de todo lo demás
 * (elegir destino, enviar, seguir el trabajo y decir la verdad).
 *
 * Vive separado de printTicket para que el agente local pueda imprimir bytes
 * que ya le llegaron del servidor por socket, sin volver a generar el ticket.
 */
export async function printBytes({ bytes, role = 'kitchen', queue = null, confirm = 'background', confirmTimeoutMs, ticketType = null, orderId = null } = {}) {
  const destination = await resolveDestination({ role, queue });

  if (!destination.queue) {
    // Sin impresora el ticket se genera igual: la comanda no se pierde.
    return {
      submitted: false,
      printed: null,
      jobId: null,
      queue: null,
      role,
      reason: destination.reason,
      source: destination.source,
      diagnostic: destination
    };
  }

  const job = jobs.createJob({
    role,
    queue: destination.queue,
    ticketType: ticketType || (role === 'counter' ? 'receipt' : 'kitchen'),
    orderId,
    bytes: bytes?.length ?? 0,
    device: destination.entry?.binding?.device?.model || null
  });

  const tempFile = await writeTempTicket(bytes);

  try {
    const result = await provider.submitJob(destination.queue, tempFile);
    if (!result.ok) {
      jobs.patch(job.id, { status: jobs.STATUS.FAILED, error: result.error });
      return {
        submitted: false, printed: false, jobId: job.id, queue: destination.queue,
        role, status: jobs.STATUS.FAILED, reason: result.error, source: destination.source
      };
    }

    jobs.patch(job.id, { status: jobs.STATUS.SENT, cupsJobId: result.jobId });

    if (confirm === 'wait') {
      const timeoutMs = confirmTimeoutMs ?? 15000;
      jobs.confirmInBackground(job.id, provider, { timeoutMs });
      // Se espera de forma acotada para poder responder con la verdad.
      const deadline = Date.now() + timeoutMs;
      let current = jobs.getJob(job.id);
      while (Date.now() < deadline && current?.status === jobs.STATUS.SENT) {
        await new Promise(r => setTimeout(r, 300));
        current = jobs.getJob(job.id);
      }
      return {
        submitted: true,
        // printed puede ser false, true o null (no confirmable). Nunca se
        // devuelve true sin comprobar que el trabajo salió de la cola.
        printed: current?.status === jobs.STATUS.PRINTED ? true
          : current?.status === jobs.STATUS.UNCONFIRMABLE ? null
            : false,
        jobId: job.id,
        cupsJobId: result.jobId,
        queue: destination.queue,
        role,
        status: current?.status,
        reason: current?.reason || null,
        source: destination.source
      };
    }

    if (confirm === 'background') {
      jobs.confirmInBackground(job.id, provider, { timeoutMs: confirmTimeoutMs ?? 20000 });
    }

    return {
      submitted: true,
      printed: null,
      jobId: job.id,
      cupsJobId: result.jobId,
      queue: destination.queue,
      role,
      status: jobs.STATUS.SENT,
      source: destination.source
    };
  } finally {
    try { await fs.unlink(tempFile); } catch { /* el archivo temporal ya no importa */ }
  }
}

/**
 * Prueba de impresion del panel. A diferencia del POS normal, aquí SÍ se espera
 * el resultado: el usuario quiere saber si salió papel, no solo si el trabajo
 * entró en la cola.
 */
export async function printTestText({ queue = null, text = null, role = 'kitchen', confirmTimeoutMs = 12000 } = {}) {
  const content = text || [
    '\\x1b\\x40',
    centerLine('PRUEBA DE IMPRESION', 32),
    '-'.repeat(32),
    new Date().toLocaleString('es-VE'),
    'Si lees esto, funciona.',
    `Equipo: ${os.hostname()}`,
    '-'.repeat(32),
    '\\x1d\\x56\\x41\\x00'
  ].join('\\n');

  const result = await printBytes({
    bytes: toEscPosBinary(content),
    role: role || 'test',
    queue,
    ticketType: 'test',
    confirm: 'wait',
    confirmTimeoutMs
  });

  return {
    ...result,
    unknown: result.status === 'unconfirmable'
  };
}

/** Centra un texto en un ancho dado, para la prueba sin depender de ticket.js. */
const centerLine = (text, width) => {
  const clean = String(text ?? '');
  const pad = Math.max(0, Math.floor((width - clean.length) / 2));
  return ' '.repeat(pad) + clean;
};

// ---------------------------------------------------------------
// Panel: inventario, aprovisionamiento, enlaces y limpieza
// ---------------------------------------------------------------

export const getInventory = buildInventory;
export const provision = provisionDevice;
export const getHealth = getQueueHealth;
export { invalidateInventory };

/** Nombre del negocio, para que cada cliente imprima con el suyo y no con "GAUCHOS". */
const businessName = (override) => String(override || process.env.BUSINESS_NAME || 'GAUCHOS').trim();

export async function bindQueueToLogical(logicalId, queue) {
  const logical = (await readLogicalPrinters()).find(p => p.id === logicalId);
  if (!logical) return { ok: false, error: `No existe la impresora lógica "${logicalId}"` };

  const safe = provider.sanitizeQueueName?.(queue) ?? null;
  if (!safe) return { ok: false, error: 'Nombre de cola no válido' };

  const inventory = await buildInventory();
  const entry = inventory.printers.find(p => p.queue === safe);
  if (!entry) return { ok: false, error: `La cola "${safe}" no existe en CUPS` };

  const bindings = await readLocalBindings();
  bindings[logicalId] = {
    queue: safe,
    serial: entry.binding?.device?.serial || null,
    connected: entry.binding.status === 'connected',
    boundAt: new Date().toISOString()
  };
  await writeLocalBindings(bindings);
  return { ok: true, logicalId, queue: safe, connected: entry.binding.status === 'connected', warning: entry.binding.status === 'connected' ? null : entry.binding.reason };
}

export async function unbindLogical(logicalId) {
  const bindings = await readLocalBindings();
  delete bindings[logicalId];
  await writeLocalBindings(bindings);
  return { ok: true, logicalId };
}

export async function clearStuckJobs(queue = null) {
  if (typeof provider.cancelJobs !== 'function') return { ok: false, error: 'No se puede limpiar la cola en esta plataforma' };
  const inventory = await buildInventory();
  const targets = queue
    ? [queue]
    : inventory.printers.filter(p => p.pendingJobs > 0).map(p => p.queue);

  if (!targets.length) return { ok: true, cleared: [], message: 'No hay trabajos atascados' };

  const cleared = [];
  const failed = [];
  for (const target of targets) {
    const result = await provider.cancelJobs(target);
    if (result.ok) cleared.push(target);
    else failed.push({ queue: target, error: result.error });
  }
  return { ok: failed.length === 0, cleared, failed };
}

export const listJobs = jobs.listJobs;
export const jobSummary = jobs.jobSummary;
export const getJob = jobs.getJob;
/**
 * El servidor los usa para registrar los trabajos que delega en el agente local:
 * ahí no puede saber nada del envío hasta que el agente responda.
 */
export const createPrintJob = jobs.createJob;
export const patchPrintJob = jobs.patch;

/** Diagnostico completo para el panel y la consola. */
export async function getDiagnostics() {
  const inventory = await buildInventory();
  const logical = await readLogicalPrinters();
  const bindings = await readLocalBindings();

  const resolutions = [];
  for (const printer of logical) {
    const resolved = await resolveDestination({ role: printer.id, inventory });
    resolutions.push({
      id: printer.id,
      label: printer.label,
      role: printer.role,
      enabled: printer.enabled,
      requireConnected: printer.requireConnected,
      destino: resolved.queue,
      origen: resolved.source,
      motivo: resolved.reason,
      aviso: resolved.warning || (resolved.staleQueue ? `Binding obsoleto: ${resolved.staleQueue}` : null)
    });
  }

  return {
    plataforma: process.platform,
    provider: providerName(),
    cupsDisponible: providerName() === 'cups' ? cups.isCupsAvailable() : null,
    usbDisponible: inventory.usbAvailable,
    resumenTrabajos: jobs.jobSummary(),
    impresorasLogicas: resolutions,
    impresorasDetectadas: inventory.printers.map(p => ({
      cola: p.queue,
      modelo: p.binding?.device?.model || p.printerInfo || null,
      marca: p.binding?.device?.vendorLabel || null,
      usb: p.binding?.device?.vidPid || null,
      serial: p.binding?.device?.serial || null,
      estado: p.binding?.status,
      motivo: p.binding?.reason,
      puntaje: p.score,
      senales: p.signals || [],
      pendientes: p.pendingJobs,
      enviados: p.completedJobs,
      aceptaTrabajos: p.accepting,
      // Qué tan segura es la impresión ESC/POS aquí. No se supone por el nombre
      // de la cola: una impresora de red puede ser una chorro de tinta que
      // escupirá basura en crudo. Solo se afirma cuando el equipo se verificó
      // como impresora por USB.
      escPosCrudo: p.termica?.termica ?? null,
      motivoEscPos: p.termica?.motivo || null
    })),
    sinAprovisionar: inventory.unprovisionedDevices.map(d => ({
      modelo: d.model,
      marca: d.vendorLabel,
      usb: d.vidPid,
      serial: d.serial,
      tipo: d.kind,
      uri: d.cupsUri
    })),
    duplicadas: inventory.duplicates || [],
    avisos: inventory.warnings || [],
    bindingsLocales: bindings,
    nota: inventory.note || null,
    avisoRawWindows: providerName() === 'windows'
      ? 'Windows no envía ESC/POS crudo de forma fiable. Para ESC/POS completo usa un agente en Linux con CUPS o una impresora compartida.'
      : null
  };
}

// ---------------------------------------------------------------
// Compatibilidad hacia atras
// ---------------------------------------------------------------

export const generateKitchenTicket = generarComandaCocina;
export const generateCustomerTicket = generarCuentaCliente;
export { generarComandaCocina, generarCuentaCliente, buildKitchenTicket };
export { jobs as printJobs };

/**
 * Wrapper de compatibilidad con la firma anterior.
 * Ahora distingue submitted (el trabajo entró en la cola) de printed (que salió
 * de ella). Antes ambos valores eran true en cuanto `lp` aceptaba, y por eso el
 * sistema llegaba a decir "comanda enviada" con 22 trabajos atascados.
 */
export async function sendKitchenTicket(order = {}, options = {}) {
  const isReceipt = options.type === 'cliente' || options.type === 'receipt';
  const result = await printTicket({
    role: options.role || (isReceipt ? 'counter' : 'kitchen'),
    ticketType: isReceipt ? 'receipt' : 'kitchen',
    order,
    name: options.restaurantName || options.name || null,
    queue: options.printerName || null,
    confirm: options.confirm || 'background'
  });

  return {
    success: result.submitted,
    submitted: result.submitted,
    printed: result.printed,
    status: result.status || null,
    queue: result.queue,
    printer: result.queue,
    source: result.source,
    jobId: result.jobId,
    reason: result.reason || null,
    ticket: result.ticket
  };
}