#!/usr/bin/env node
// Agente de impresión local.
//
// Corre en el equipo donde están las impresoras físicas (el del restaurante) y
// recibe por socket los tickets que genera el servidor. Toda la lógica de qué
// impresora usar y si se imprimió de verdad vive en utils/printer/, no aquí:
// este archivo solo habla con el servidor y con el subsistema de impresión.

import { io } from 'socket.io-client';
import { printBytes, getDiagnostics, printJobs } from './utils/printer/index.js';
import { resolveAgentToken } from './utils/agente-token.js';

// Solo etiqueta los logs. La impresora real se decide en runtime.
const tag = process.env.PRINTER_LOG_TAG || 'POS';
const log = (...args) => console.log(`[${tag}]`, ...args);
const warn = (...args) => console.warn(`[${tag}]`, ...args);
const fail = (...args) => console.error(`[${tag}]`, ...args);

const defaultRenderUrl = process.env.RENDER_URL || 'https://pdwa-gauchos.onrender.com';
const normalizeSocketUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return defaultRenderUrl;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
};
const socketUrl = normalizeSocketUrl(process.env.SOCKET_URL || defaultRenderUrl);

// Convierte el payload que manda el servidor a bytes ESC/POS. El servidor
// envía el texto con escapes \xNN en lugar de binario puro porque JSON no
// transporta bytes crudos.
const decodeEscPosPayload = (input) => {
  if (Buffer.isBuffer(input)) return input;
  const asText = Buffer.from(String(input || ''), 'binary').toString('binary');
  return Buffer.from(
    asText.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
    'binary'
  );
};

/**
 * Imprime un ticket recibido por el socket.
 * Devuelve el resultado con su estado real, para poder informarlo de vuelta.
 */
const printOnClient = async (content, options = {}) => {
  const buffer = decodeEscPosPayload(content);
  if (!buffer.length) {
    warn('Evento recibido sin datos ESC/POS.');
    return { submitted: false, reason: 'Payload vacío' };
  }

  const result = await printBytes({
    bytes: buffer,
    role: options.role || 'kitchen',
    queue: options.queue || null,
    confirm: options.confirm || 'background'
  });

  if (!result.submitted) {
    fail(`Ticket NO enviado: ${result.reason}`);
    return result;
  }

  log(`Enviado a ${result.queue} (origen: ${result.source}). Trabajo ${result.jobId}.`);
  return result;
};

// El servidor no acepta a cualquiera: este canal imprime en la ticketera del
// restaurante, así que se presenta con el secreto. Si servidor y agente están en
// el mismo equipo, se lee el mismo archivo y no hay nada que configurar; si
// están en equipos distintos, el secreto se copia a AGENT_TOKEN.
const { token: AGENT_TOKEN, origen: tokenOrigen } = resolveAgentToken();

const socket = io(socketUrl, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  auth: { token: AGENT_TOKEN },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  timeout: 20000,
  forceNew: true,
});

/**
 * Avisa al servidor qué hay en este equipo. El panel lo muestra, así el
 * administrador no tiene que adivinar por qué no le sale la comanda.
 */
const reportInventory = async () => {
  try {
    const diag = await getDiagnostics();
    const resumen = [];

    for (const logical of diag.impresorasLogicas || []) {
      resumen.push(`${logical.label}: ${logical.destino || 'SIN IMPRESORA'}${logical.aviso ? ` (${logical.aviso})` : ''}`);
    }
    for (const printer of diag.impresorasDetectadas || []) {
      resumen.push(`cola ${printer.cola}: ${printer.modelo || printer.estado}`);
    }

    if (diag.avisoRawWindows) warn(diag.avisoRawWindows);

    const sinDestino = (diag.impresorasLogicas || []).filter(p => !p.destino);
    if (sinDestino.length) {
      fail('SIN IMPRESORA PARA: ' + sinDestino.map(p => p.label).join(', '));
      for (const printer of diag.impresorasDetectadas || []) {
        fail(`  - ${printer.cola}: ${printer.motivo}`);
      }
      fail('  Solución: enchufa la impresora y créale una cola desde el panel, o fija PRINTER_NAME.');
    } else {
      log('Inventario local:');
      for (const line of resumen) log('  ' + line);
    }

    // Se envía al servidor para que aparezca en el panel.
    socket.emit('inventario_impresoras', {
      agente: tag,
      plataforma: diag.plataforma,
      provider: diag.provider,
      impresoras: diag.impresorasDetectadas,
      logicas: diag.impresorasLogicas,
      resumen: diag.resumenTrabajos
    });
  } catch (error) {
    warn('No se pudo verificar la impresora local:', error?.message || error);
  }
};

socket.on('connect', async () => {
  log('Conectado al servidor. Listo para recibir impresiones.');
  log(`URL: ${socketUrl}`);
  await reportInventory();
});

socket.on('connect_error', (error) => {
  const motivo = String(error?.message || error || '');

  // Un secreto incorrecto reintenta eternamente sin decir qué hacer, y eso es lo
  // peor: el dueño ve el agente "conectándose" y cree que la impresora falla.
  if (/Secreto de agente/i.test(motivo)) {
    fail('El servidor rechazó este agente: el secreto no coincide.');
    fail(`URL: ${socketUrl}`);
    if (tokenOrigen === 'archivo') {
      fail('Este equipo tiene su propio agente.token y el servidor usa otro.');
    }
    fail('Solución: copia el secreto que imprime el servidor al arrancar y ponlo');
    fail('         en la variable AGENT_TOKEN de este equipo, o borra el');
    fail('         archivo agente.token si servidor y agente están aquí mismo.');
    return;
  }

  fail('No se pudo conectar al servidor.');
  fail(`URL: ${socketUrl}`);
  fail(`Motivo: ${motivo}`);
  fail('Verifica que el backend esté sirviendo /socket.io');
});

socket.on('disconnect', (reason) => {
  warn(`Desconectado del servidor. Motivo: ${reason}`);
});

socket.on('imprimir_ticket', async (payload) => {
  const { tipo, datosEscPos, role, jobId, wait } = payload || {};
  if (!datosEscPos) {
    warn('Evento recibido sin datos ESC/POS.');
    return;
  }

  // `cuenta` va a la impresora de caja; el resto, a la de cocina.
  const destino = role || (tipo === 'cliente' || tipo === 'cuenta' ? 'counter' : 'kitchen');
  log(`Comanda recibida (${tipo || destino})`);

  // Si el servidor espera respuesta, hay que confirmar de verdad: "enviado" no
  // le sirve para decidir si le dice al cliente que salió papel.
  const result = await printOnClient(datosEscPos, {
    role: destino,
    confirm: wait ? 'wait' : 'background'
  });

  const report = (extra) => socket.emit('job_estado', {
    serverJobId: jobId || null,
    agentJobId: result?.jobId || null,
    submitted: Boolean(result?.submitted),
    printed: result?.printed ?? null,
    status: result?.status || (result?.submitted ? 'sent' : 'failed'),
    queue: result?.queue || null,
    reason: result?.reason || null,
    ...extra
  });

  // Respuesta inmediata: el servidor ya puede dejar de esperar al POS.
  report();

  // Y luego el veredicto real, cuando el trabajo haya salido (o no) de la cola.
  // Sin esto el servidor se quedaría con "enviado" para siempre, que es
  // justamente la mentira que hay que evitar.
  if (!wait && result?.submitted && result?.jobId) watchJob(jobId, result.jobId);
});

/**
 * Sigue un trabajo hasta que deja de estar pendiente y avisa al servidor.
 * El agente no bloquea nada: solo espera en segundo plano.
 */
const watchJob = (serverJobId, agentJobId) => {
  const deadline = Date.now() + 40000;
  const poll = () => {
    const job = printJobs.getJob(agentJobId);
    if (!job) return;
    if (job.status === 'sending' || job.status === 'sent') {
      if (Date.now() < deadline) return setTimeout(poll, 500);
      return socket.emit('job_estado', {
        serverJobId,
        agentJobId,
        printed: null,
        status: 'unconfirmable',
        reason: 'El trabajo no salió de la cola en 40s.'
      });
    }
    socket.emit('job_estado', {
      serverJobId,
      agentJobId,
      printed: job.status === 'printed' ? true : job.status === 'unconfirmable' ? null : false,
      status: job.status,
      queue: job.queue,
      reason: job.reason || null
    });
  };
  setTimeout(poll, 500);
};

/** Pide una prueba de impresión desde el panel. */
socket.on('probar_impresora', async (payload) => {
  const { role, texto } = payload || {};
  const contenido = texto
    ? decodeEscPosPayload(texto)
    : decodeEscPosPayload([
        '\\x1b\\x40',
        'PRUEBA DE IMPRESION',
        '------------------------------',
        new Date().toLocaleString('es-VE'),
        'Si lees esto, funciona.',
        '------------------------------',
        '\\x1d\\x56\\x41\\x00'
      ].join('\\n'));

  const result = await printOnClient(contenido, { role: role || 'kitchen', confirm: 'wait' });
  socket.emit('job_estado', {
    submitted: Boolean(result?.submitted),
    printed: result?.printed ?? null,
    status: result?.status || null,
    queue: result?.queue || null,
    reason: result?.reason || null,
    prueba: true
  });
});

/** Consulta el estado de un trabajo que este agente imprimió. */
socket.on('consultar_job', (payload, reply) => {
  const job = printJobs.getJob(payload?.jobId);
  if (typeof reply === 'function') reply(job || null);
});

process.on('SIGINT', () => {
  log('Cerrando agente de impresión...');
  socket.close();
  process.exit(0);
});
