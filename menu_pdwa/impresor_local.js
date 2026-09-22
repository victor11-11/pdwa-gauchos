#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { io } from 'socket.io-client';

const execAsync = promisify(exec);
const defaultRenderUrl = process.env.RENDER_URL || 'https://pdwa-gauchos.onrender.com';
const normalizeSocketUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return defaultRenderUrl;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
};
const socketUrl = normalizeSocketUrl(process.env.SOCKET_URL || defaultRenderUrl);
const printerName = process.env.PRINTER_NAME || 'POS-80';

const makeTempTicketPath = () => {
  const tempDir = os.tmpdir();
  return path.join(tempDir, `ticket_pos_${Date.now()}_${Math.random().toString(16).slice(2)}.bin`);
};

const decodeEscPosPayload = (input) => {
  const raw = Buffer.isBuffer(input) ? input : String(input || '');
  const asBinary = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'binary');
  const text = asBinary.toString('binary');
  return Buffer.from(
    text.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
    'binary'
  );
};

const printOnClient = async (content, printer = printerName) => {
  const tempPath = makeTempTicketPath();
  const bufferComandos = decodeEscPosPayload(content);
  fs.writeFileSync(tempPath, bufferComandos);

  try {
    if (process.platform === 'linux') {
      console.log(`[${printer}] Imprimiendo en Linux via lp -d ${printer} -o raw ...`);
      await execAsync(`lp -d ${printer} -o raw "${tempPath}"`);
    } else if (process.platform === 'win32') {
      console.log(`[${printer}] Imprimiendo en Windows via print /D:"${printer}" ...`);
      await execAsync(`print /D:"${printer}" "${tempPath}"`);
    } else {
      console.log(`[${printer}] Plataforma no soportada: ${process.platform}. Guardando ticket temporal en ${tempPath}`);
    }
  } catch (error) {
    console.error(`[${printer}] Error al imprimir el ticket local:`, error.message || error);
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (cleanupError) {
      console.warn(`[${printer}] No se pudo eliminar el archivo temporal:`, cleanupError.message || cleanupError);
    }
  }
};

const socket = io(socketUrl, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  timeout: 20000,
  forceNew: true,
});

socket.on('connect', () => {
  console.log(`[${printerName}] Conectado exitosamente al servidor de Render. Listo para recibir impresiones.`);
  console.log(`[${printerName}] URL del servidor: ${socketUrl}`);
});

socket.on('connect_error', (error) => {
  console.error(`[${printerName}] No se pudo conectar al servidor de Render.`);
  console.error(`[${printerName}] URL: ${socketUrl}`);
  console.error(`[${printerName}] Motivo: ${error?.message || error}`);
  console.error('[POS-80] Verifica que el servicio de Render esté actualizado y que el backend esté sirviendo /socket.io');
});

socket.on('disconnect', (reason) => {
  console.warn(`[${printerName}] Desconectado del servidor de Render. Motivo: ${reason}`);
});

socket.on('imprimir_ticket', async (payload) => {
  const { tipo, datosEscPos } = payload || {};
  if (!datosEscPos) {
    console.warn(`[${printerName}] Evento recibido sin datos ESC/POS.`);
    return;
  }

  const tipoLabel = tipo || 'ticket';
  console.log(`[${printerName}] Recibida impresión remota (${tipoLabel})`);
  await printOnClient(datosEscPos, printerName);
});

process.on('SIGINT', () => {
  console.log(`[${printerName}] Cerrando cliente de impresión...`);
  socket.close();
  process.exit(0);
});
