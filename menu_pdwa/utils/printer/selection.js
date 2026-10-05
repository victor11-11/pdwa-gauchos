// Cruce entre lo que CUPS cree que existe y lo que esta realmente conectado.
//
// Este archivo contiene la correccion del problema original: la app elegia una
// cola cuyo dispositivo USB no estaba enchufado y por eso las comandas se
// quedaban atascadas. Aqui la presencia fisica manda sobre cualquier otra
// pista, y una cola sin dispositivo queda descalificada de forma explicita.

import { listConnectedPrinters, listUsbDevices, usbLayerAvailable } from './identity.js';
import * as cups from './cups.js';

// Una cola cuyo dispositivo no esta presente no puede imprimir nunca. Se
// descalifica con una diferencia tan grande que ni el historial ni el nombre
// pueden compensarla.
const SCORE_DEVICE_MISSING = -200;

const normalize = (value) => String(value || '').trim().toLowerCase();

/** ¿Este texto coincide con el modelo USB? Compara sin acentos ni simbolos. */
const looseEquals = (a, b) => {
  const clean = (v) => normalize(v).replace(/[^a-z0-9]/g, '');
  const left = clean(a);
  const right = clean(b);
  return Boolean(left) && left === right;
};

/**
 * Asocia una cola de CUPS con el dispositivo USB fisico.
 *
 * El serial es la unica clave fiable: el nombre del producto USB NO lo es.
 * En la maquina de trabajo la Kadosh se anuncia como "printer/GLPrinter80" en
 * USB pero su cola conserva un nombre antiguo, porque CUPS guardo el nombre
 * viejo. Por eso el cruce va primero por serial.
 */
export async function bindQueueToDevice(queueInfo, devices) {
  const uri = queueInfo.uri;

  // Una cola de red no tiene hardware USB que verificar.
  if (!uri || uri.scheme !== 'usb') {
    return {
      status: uri && uri.scheme ? 'network' : 'orphan',
      reason: uri && uri.scheme
        ? `Impresora de red (${uri.scheme})`
        : 'La cola no tiene device-uri, no se puede verificar'
    };
  }

  // 1) Serial exacto: coincidencia definitiva.
  if (uri.serial) {
    const match = devices.find(d => d.serial && normalize(d.serial) === normalize(uri.serial));
    if (match) return { status: 'connected', device: match, reason: `Serial ${uri.serial} coincide` };
    return {
      status: 'device-missing',
      reason: `El dispositivo con serial ${uri.serial} no está conectado. La cola aceptará el trabajo pero nunca se imprimirá.`
    };
  }

  // 2) Sin serial: se intenta por descriptores, aunque es aproximado.
  const byStrings = devices.find(d =>
    looseEquals(d.manufacturer, uri.manufacturer) && looseEquals(d.product, uri.product)
  );
  if (byStrings) {
    return { status: 'connected', device: byStrings, reason: 'Coincide por nombre USB (el dispositivo no reporta serial)' };
  }

  const anyPrinter = devices.filter(d => d.kind === 'printer' || d.kind === 'vendor');
  if (anyPrinter.length === 1) {
    return { status: 'connected', device: anyPrinter[0], reason: 'Única impresora conectada, la cola no declara serial' };
  }

  return {
    status: 'orphan',
    reason: anyPrinter.length
      ? `Hay ${anyPrinter.length} impresoras conectadas y ninguna coincide con esta cola`
      : 'No hay ninguna impresora USB conectada'
  };
}

/**
 * Puntua una cola como destino de tickets termicos.
 * La presencia del dispositivo pesa mas que cualquier otra señal.
 */
export function scoreQueue(entry) {
  const signals = [];
  let score = 0;

  switch (entry.binding.status) {
    case 'connected':
      if (entry.binding.device.kind === 'printer') {
        score += 60;
        signals.push(`conectada y es impresora (clase USB 07): ${entry.binding.device.model}`);
      } else {
        score += 25;
        signals.push(`conectada pero clase USB ${entry.binding.device.kind}: hay que probarla`);
      }
      break;
    case 'device-missing':
      score += SCORE_DEVICE_MISSING;
      signals.push(entry.binding.reason);
      break;
    case 'network':
      score -= 10;
      signals.push(entry.binding.reason);
      break;
    default:
      score -= 50;
      signals.push(entry.binding.reason || 'sin device-uri verificable');
  }

  if (entry.accepting) {
    score += 10;
    signals.push('acepta trabajos');
  }
  if (entry.stopped) {
    score -= 40;
    signals.push('CUPS la tiene detenida');
  }

  // Una cola con trabajos pendientes sin imprimir delata un atasco. Es la
  // senal de que el dispositivo no responde.
  if (entry.pendingJobs > 0) {
    const penalty = Math.min(60, entry.pendingJobs * 20);
    score -= penalty;
    signals.push(`${entry.pendingJobs} trabajo(s) sin salir de la cola`);
  }

  if (entry.isDefault) {
    score += 5;
    signals.push('destino por defecto del sistema');
  }
  if (entry.completedJobs > 0) {
    score += 3;
    signals.push(`${entry.completedJobs} trabajos enviados antes`);
  }

  return { score, signals };
}

// Consultar CUPS cuesta ~1 s por llamada. En cada impresion del POS eso seria
// several segundos de espera, asi que el inventario se cachea unos segundos.
// Un fallo de impresion siempre fuerza una lectura fresca (force: true).
const CACHE_TTL_MS = 8000;
let cache = { at: 0, value: null };
let inFlight = null;

export const invalidateInventory = () => {
  cache = { at: 0, value: null };
};

/** Inventario completo: colas de CUPS + hardware conectado, ya cruzado. */
/**
 * ¿Esta cola es una impresora térmica de tickets?
 *
 * Importa más de lo que parece. Mandar ESC/POS crudo a una impresora de
 *Tickets al laser o de chorro de tinta no da error: da papel lleno de
 * caracteres raros, y el dueño cree que el sistema está roto. Como no hay forma
 * de saberlo con certeza sin imprimir, aquí solo se afirma lo que se puede
 * comprobar y el resto se marca como dudoso para que quien lo configure decida.
 *
 * Se considera térmica si el modelo o la cola se identifica como POS,
 * ticketera, ESC/POS o papel térmico; la clase USB 07 solo confirma que es
 * impresora, no distingue entre térmica, tinta o láser.
 */
const TERMICAL_WORDS = /\b(tm[-_ ]?t\d+|xp[-_ ]?\d{2,3}|pos|thermal|termic|termica|termico|ticket|ticketera|tickets|receipt|recibo|recibos|escpos|esc[-/ ]?pos|factura|facturadora|80mm|58mm|mm\s*80)\b/i;

export function describeThermalCapability(entry) {
  const device = entry?.binding?.device;
  const texto = [device?.model, entry?.makeAndModel, entry?.printerInfo, entry?.deviceUri].filter(Boolean).join(' ');
  if (TERMICAL_WORDS.test(texto)) {
    return { termica: true, certeza: 'declarada', motivo: 'La cola se describe como impresora de tickets.' };
  }

  if (device) {
    return {
      termica: null,
      certeza: 'dudosa',
      motivo: device.kind === 'printer'
        ? 'Es una impresora USB, pero no se pudo confirmar si es térmica.'
        : 'Equipo USB presente, pero su tipo de impresora no se pudo confirmar.'
    };
  }

  return {
    termica: false,
    certeza: 'descartada',
    motivo: 'No parece una impresora de tickets: mandarle ESC/POS en crudo saldría como caracteres raros.'
  };
}

/**
 * Detecta varias colas apuntando al MISMO equipo fisico.
 *
 * Es un error de instalacion facil de cometer y muy dificil de entender: CUPS
 * deja las dos colas "aceptando peticiones" y parece todo bien, pero solo una
 * puede tomar el dispositivo. Los trabajos de la otra se quedan esperando para
 * siempre y el sistema acaba informando "comanda enviada" sin imprimir nada.
 */
export function findDuplicateTargets(printers) {
  const bySerial = new Map();

  for (const p of printers) {
    const serial = p.binding?.device?.serial;
    if (!serial) continue;
    const key = normalize(serial);
    if (!bySerial.has(key)) bySerial.set(key, []);
    bySerial.get(key).push(p);
  }

  const duplicates = [];
  for (const [key, group] of bySerial) {
    if (group.length < 2) continue;
    duplicates.push({
      serial: group[0].binding.device.serial,
      modelo: group[0].binding.device.model,
      colas: group.map(p => ({ queue: p.queue, pendientes: p.pendingJobs, score: p.score })),
      // La primera es la que se queda con el dispositivo.
      activa: group[0].queue,
      aviso: `Varias colas (${group.map(p => p.queue).join(', ')}) apuntan al mismo equipo ${group[0].binding.device.model}. Solo "${group[0].queue}" puede imprimir; las demás se quedan atascadas. Borra las sobrantes con: lpadmin -x <cola>`
    });
  }

  return duplicates;
}

export async function buildInventory(options = {}) {
  const now = Date.now();
  const fresh = cache.value && (now - cache.at) < CACHE_TTL_MS;

  if (fresh && !options.force) return cache.value;
  // Varias llamadas simultaneas comparten una sola lectura real.
  if (inFlight && !options.force) return inFlight;

  inFlight = buildInventoryUncached()
    .then(result => {
      cache = { at: Date.now(), value: result };
      return result;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}

async function buildInventoryUncached() {
  const cupsAvailable = cups.isCupsAvailable();
  const usbAvailable = process.platform === 'linux' ? await usbLayerAvailable() : false;

  if (!cupsAvailable) {
    return {
      platform: process.platform,
      cupsAvailable: false,
      usbAvailable,
      printers: [],
      unprovisionedDevices: [],
      recommend: null,
      note: process.platform === 'win32'
        ? 'Windows no usa CUPS. Se usa el proveedor de Windows.'
        : 'CUPS no está instalado en este equipo.'
    };
  }

  const [devices, queues] = await Promise.all([listConnectedPrinters(), cups.listQueues()]);

  // Cada consulta a CUPS tarda cerca de un segundo porque habla con cupsd, asi
  // que las colas se describen en paralelo. Si se hiciera una a una, con tres
  // impresoras el inventario tardaria tres segundos en cada impression.
  const described = await Promise.all(queues.map(queue => cups.describeQueue(queue)));

  const printers = [];
  for (const info of described) {
    if (!info) continue;
    const binding = await bindQueueToDevice(info, devices);
    const scored = scoreQueue({ ...info, binding });
    printers.push({
      ...info,
      binding,
      ...scored,
      // Se calcula una sola vez y viaja con la cola: la resolucion de destino
      // lo necesita y no tiene acceso al hardware.
      termica: describeThermalCapability({ ...info, binding })
    });
  }

  printers.sort((a, b) => b.score - a.score);

  // Dispositivos USB presentes que todavia no tienen cola: son los que se
  // pueden aprovisionar solos, sin saber la marca.
  const claimedSerials = new Set(
    printers
      .map(p => p.binding?.device?.serial)
      .filter(Boolean)
      .map(s => normalize(s))
  );

  const unprovisionedDevices = devices.filter(d =>
    d.serial && !claimedSerials.has(normalize(d.serial))
  );

  const usable = printers.filter(p => p.binding.status === 'connected');
  const recommend = usable.length ? usable[0].queue : null;

  const duplicates = findDuplicateTargets(printers);

  return {
    platform: process.platform,
    cupsAvailable: true,
    usbAvailable,
    printers,
    unprovisionedDevices,
    duplicates,
    recommend,
    note: recommend
      ? null
      : 'Ninguna cola tiene un dispositivo conectado ahora mismo.',
    // Una cola duplicada no es un fallo de impresión, pero explica un
    // atasco silencioso, así que se avisa aparte.
    warnings: duplicates.map(d => d.aviso)
  };
}

/**
 * Crea una cola RAW para un dispositivo USB que todavia no tiene una.
 * Nombre sugerido a partir del modelo real, no de un nombre fijo.
 */
export async function provisionDevice(device, options = {}) {
  if (!device || !device.cupsUri) {
    return { ok: false, error: 'Dispositivo sin URI de USB' };
  }

  const suggested = String(device.model || 'TERMICA')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'TERMICA';

  const queueName = cups.sanitizeQueueName(options.queueName || suggested);
  if (!queueName) return { ok: false, error: 'Nombre de cola no válido' };

  const result = await cups.provisionRawQueue(device.cupsUri, queueName);
  if (!result.ok) return result;

  // Si la cola se acaba de crear, ya puede usarse como destino.
  return { ...result, device: { serial: device.serial, model: device.model, vidPid: device.vidPid } };
}

/** Verificacion rapida de salud de una cola, para el panel. */
export async function getQueueHealth(queue) {
  const info = await cups.describeQueue(queue);
  if (!info) return { ok: false, error: 'Cola no encontrada' };
  return {
    ok: true,
    queue: info.queue,
    accepting: info.accepting,
    idle: info.idle,
    stopped: info.stopped,
    pendingJobs: info.pendingJobs,
    completedJobs: info.completedJobs
  };
}

export { listUsbDevices };