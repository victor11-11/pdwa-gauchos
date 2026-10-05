// Identidad fisica de las impresoras.
//
// Idea central: el nombre de la cola CUPS y la marca del dispositivo NO son
// datos fiables. Las termicas baratas reportan "printer"/"POS-80" como
// descriptores USB, asi que dos impresoras de marcas distintas pueden acabar
// con el mismo nombre de cola. Lo que si es unico y estable es el hardware:
// vendor, product y sobre todo el NUMERO DE SERIE.
//
// Este modulo lee /sys/bus/usb/devices (no depende de herramientas externas)
// y devuelve el inventario real de lo que esta conectado ahora mismo.

import fs from 'fs/promises';
import path from 'path';

const USB_ROOT = '/sys/bus/usb/devices';

// Clase de interfaz USB 07 = Printer. Es la senal definitiva de una impresora.
const CLASS_PRINTER = '07';
// Clase ff = vendor-specific. Muchas ESC/POS economicas se declaran asi en vez
// de 07, asi que se listan como candidatas pero NO se dan por buenos: la
// capacidad se confirma despues enviando un trabajo real.
const CLASS_VENDOR = 'ff';

const readAttr = async (dir, name) => {
  try {
    const value = await fs.readFile(path.join(dir, name), 'utf8');
    return value.trim() || null;
  } catch {
    return null;
  }
};

const readInterfaces = async (deviceDir) => {
  const interfaces = [];
  let entries = [];
  try {
    entries = await fs.readdir(deviceDir);
  } catch {
    return interfaces;
  }

  for (const entry of entries) {
    // Las interfaces son subdirectorios con el patrón "1-2:1.0". Los ficheros
    // sueltos del dispositivo (idVendor, product...) no llevan dos puntos.
    if (!entry.includes(':')) continue;
    const ifaceDir = path.join(deviceDir, entry);
    const cls = await readAttr(ifaceDir, 'bInterfaceClass');
    if (!cls) continue;
    interfaces.push({
      number: entry.split(':')[1] || null,
      class: cls,
      subclass: await readAttr(ifaceDir, 'bInterfaceSubClass'),
      protocol: await readAttr(ifaceDir, 'bInterfaceProtocol'),
      description: await readAttr(ifaceDir, 'iInterface')
    });
  }

  return interfaces;
};

/**
 * Marca como 'printer' solo si alguna interfaz es de clase 07.
 * Ojo: bDeviceClass suele ser 00 en estos equipos, porque la clase real esta
 * en la interfaz. Mirar solo el device daria falso negativo.
 */
const classify = (interfaces) => {
  if (interfaces.some(i => i.class === CLASS_PRINTER)) return 'printer';
  if (interfaces.some(i => i.class === CLASS_VENDOR)) return 'vendor';
  return 'other';
};

/** Marca conocida: solo mejora cómo se lee en el panel, nunca condiciona nada. */
const VENDOR_NAMES = {
  '0418': 'AST Research (Kadosh)',
  '04b8': 'Epson',
  '0519': 'Star Micronics',
  '0fe0': 'Xprinter / Gprinter',
  '1a86': 'CH340 (CHinese thermal)',
  '0483': 'STMicroelectronics',
  '1fc0': 'Tenda / Sunmi',
  '0dd4': 'Custom / Bixolon',
  '1e0e': 'Xprinter',
  '0489': 'Foxlink'
};

const escapeUri = (value) => String(value || '').trim().replace(/[/\\\s]+/g, '_');

/** Todos los dispositivos USB, sin filtrar. */
export async function listUsbDevices() {
  let entries = [];
  try {
    entries = await fs.readdir(USB_ROOT);
  } catch {
    return [];
  }

  const devices = [];
  for (const entry of entries) {
    // Las interfaces tienen dos puntos; los controladores (usb1) no.
    if (entry.includes(':')) continue;

    const dir = path.join(USB_ROOT, entry);
    const vid = await readAttr(dir, 'idVendor');
    if (!vid) continue;

    const productId = await readAttr(dir, 'idProduct');
    const serial = await readAttr(dir, 'serial');
    const manufacturer = await readAttr(dir, 'manufacturer');
    const product = await readAttr(dir, 'product');
    const interfaces = await readInterfaces(dir);
    const kind = classify(interfaces);

    // Un root hub o similar no debe entrar al inventario.
    if (vid === '1d6b') continue;

    devices.push({
      busPath: entry,
      vid,
      pid: productId,
      vidPid: `${vid}:${productId}`,
      serial: serial || null,
      manufacturer: manufacturer || null,
      product: product || null,
      model: [manufacturer, product].filter(Boolean).join(' ').trim() || null,
      vendorLabel: VENDOR_NAMES[vid] || null,
      deviceClass: await readAttr(dir, 'bDeviceClass'),
      interfaces,
      kind,
      // URI al estilo CUPS, por si hay que crear la cola.
      cupsUri: serial
        ? `usb://${escapeUri(manufacturer)}/${escapeUri(product)}?serial=${serial}`
        : `usb://${escapeUri(manufacturer)}/${escapeUri(product)}`
    });
  }

  return devices;
}

/**
 * Inventario de impresoras conectadas ahora.
 *  - kind 'printer': clase 07, es definitivamente una impresora.
 *  - kind 'vendor' : clase ff, posible ESC/POS; hay que probarla.
 */
export async function listConnectedPrinters() {
  const devices = await listUsbDevices();
  const printers = devices.filter(d => d.kind === 'printer' || d.kind === 'vendor');
  return printers.sort((a, b) => a.busPath.localeCompare(b.busPath, 'en', { numeric: true }));
}

/** Busca un dispositivo por numero de serie. */
export const findDeviceBySerial = async (serial) => {
  if (!serial) return null;
  const target = String(serial).trim().toLowerCase();
  const devices = await listUsbDevices();
  return devices.find(d => String(d.serial || '').toLowerCase() === target) || null;
};

/** El sistema puede ver al menos un dispositivo USB imprimible. */
export async function usbLayerAvailable() {
  try {
    const entries = await fs.readdir(USB_ROOT);
    return entries.length > 0;
  } catch {
    return false;
  }
}