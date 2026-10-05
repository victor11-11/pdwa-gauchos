#!/usr/bin/env node
// Herramienta de linea de comandos para las impresoras.
//
// Sirve para lo mismo que el panel, pero desde la consola del equipo: útil
// cuando se está instalando en un cliente nuevo o cuando hay que diagnosticar
// por SSH sin abrir el navegador.
//
//   npm run printer                  diagnóstico completo
//   npm run printer -- listar        inventario
//   npm run printer -- enlazar <rol> <cola>
//   npm run printer -- desenlazar <rol>
//   npm run printer -- probar        prueba de impresión (espera el resultado)
//   npm run printer -- limpiar       cancela los trabajos atascados
//   npm run printer -- cola <nombre>  encola la cola indicada a mano
//
// El comando `cola` es la salida de emergencia: si el aprovisionamiento
// automático falló, permite imprimir de todas formas pasando la cola a mano.

import { getDiagnostics, bindQueueToLogical, unbindLogical, printTestText, clearStuckJobs, provision, printJobs } from './index.js';
import { buildInventory } from './selection.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const OFF = '\x1b[0m';

const color = (code, text) => `${code}${text}${OFF}`;
const line = (label, value) => console.log(`  ${String(label).padEnd(20)} ${value}`);

const printDiagnostics = async () => {
  const d = await getDiagnostics();

  console.log(`\n${BOLD}Impresoras${OFF}  (${d.plataforma}, vía ${d.provider})`);
  line('CUPS disponible', d.cupsDisponible === null ? 'n/a (Windows)' : (d.cupsDisponible ? 'sí' : 'NO'));
  line('USB visible', d.usbDisponible ? 'sí' : 'no');

  console.log(`\n${BOLD}Roles configurados${OFF}`);
  for (const logical of d.impresorasLogicas) {
    const destino = logical.destino || color(RED, 'SIN IMPRESORA');
    console.log(`  ${logical.enabled ? '' : color(YELLOW, '(desactivada) ')}${String(logical.label).padEnd(10)} ${destino}`);
    console.log(`    ${color(DIM, `${logical.motivo}`)}`);
    if (logical.aviso) console.log(`    ${color(YELLOW, `AVISO: ${logical.aviso}`)}`);
  }

  console.log(`\n${BOLD}Colas detectadas${OFF}`);
  for (const p of d.impresorasDetectadas) {
    const estado = p.estado === 'connected' ? color(GREEN, 'conectada')
      : p.estado === 'device-missing' ? color(RED, 'SIN EQUIPO')
        : p.estado === 'network' ? color(DIM, 'de red') : color(YELLOW, p.estado);
    console.log(`  ${String(p.cola).padEnd(22)} ${String(p.puntaje).padStart(5)}  ${estado}`);
    console.log(`    ${p.modelo || '(sin modelo)'}${p.marca ? `  ${color(DIM, p.marca)}` : ''}`);
    console.log(`    ${color(DIM, p.motivo)}`);
    if (p.pendientes > 0) console.log(`    ${color(YELLOW, `${p.pendientes} trabajo(s) sin imprimir`)}`);
  }

  if (d.sinAprovisionar.length) {
    console.log(`\n${BOLD}Equipos conectados sin cola${OFF}  (crear cola: ${BOLD}npm run printer -- aprovisionar <serial>${OFF})`);
    for (const dev of d.sinAprovisionar) {
      console.log(`  ${String(dev.modelo || '(desconocido)').padEnd(24)} ${dev.usb}  ${color(DIM, dev.serial)}`);
    }
  }

  const s = d.resumenTrabajos;
  console.log(`\n${BOLD}Trabajos recientes${OFF}`);
  line('En memoria', s.total);
  line('Por estado', Object.entries(s.byStatus).map(([k, v]) => `${k}:${v}`).join(', ') || 'ninguno');
  line('Atascados', s.stuck ? color(YELLOW, s.stuck) : '0');
  if (s.lastPrintedAt) line('Última impresión', new Date(s.lastPrintedAt).toLocaleString('es-VE'));
  if (s.lastFailure) {
    line('Último fallo', color(RED, `${s.lastFailure.status}: ${s.lastFailure.reason || s.lastFailure.error || ''}`));
  }

  if (d.avisoRawWindows) console.log(`\n${color(YELLOW, d.avisoRawWindows)}`);
  for (const aviso of d.warnings || []) console.log(`\n${color(YELLOW, aviso)}`);
  if (d.nota) console.log(`\n${color(YELLOW, d.nota)}`);

  console.log(`\nPara imprimir ya mismo: ${BOLD}npm run printer -- probar${OFF}\n`);
};

const printList = async () => {
  const inv = await buildInventory({ force: true });
  console.log(`\n${BOLD}Colas${OFF}`);
  for (const p of inv.printers) {
    console.log(`  ${String(p.queue).padEnd(22)} puntaje ${String(p.score).padStart(5)}  ${p.binding.status}`);
    console.log(`    ${color(DIM, p.binding.reason)}`);
  }
  if (inv.unprovisionedDevices.length) {
    console.log(`\n${BOLD}Sin cola${OFF}`);
    for (const d of inv.unprovisionedDevices) {
      console.log(`  ${String(d.modelo || '').padEnd(24)} ${d.vidPid}  ${d.serial}`);
    }
  }
  console.log();
};

const main = async () => {
  const [command = 'diagnostico', ...rest] = process.argv.slice(2);

  switch (command) {
    case 'listar':
      await printList();
      return;

    case 'enlazar': {
      const [logicalId, queue] = rest;
      if (!logicalId || !queue) {
        console.error('Uso: npm run printer -- enlazar <rol> <cola>');
        process.exitCode = 1;
        return;
      }
      const result = await bindQueueToLogical(logicalId, queue);
      if (!result.ok) {
        console.error(color(RED, result.error));
        process.exitCode = 1;
        return;
      }
      console.log(result.connected
        ? color(GREEN, `Enlazada: ${logicalId} → ${queue}`)
        : color(YELLOW, `Enlazada, pero sin equipo conectado: ${result.warning}`));
      return;
    }

    case 'desenlazar': {
      const [logicalId] = rest;
      if (!logicalId) {
        console.error('Uso: npm run printer -- desenlazar <rol>');
        process.exitCode = 1;
        return;
      }
      await unbindLogical(logicalId);
      console.log(color(GREEN, `Enlace quitado. "${logicalId}" vuelve a autodetección.`));
      return;
    }

    case 'aprovisionar': {
      const [serial] = rest;
      if (!serial) {
        console.error('Uso: npm run printer -- aprovisionar <serial>');
        process.exitCode = 1;
        return;
      }
      const { listConnectedPrinters } = await import('./identity.js');
      const connected = await listConnectedPrinters();
      const device = connected.find(d => d.serial === serial);
      if (!device) {
        console.error(color(RED, `No hay ningún equipo conectado con el serial ${serial}.`));
        process.exitCode = 1;
        return;
      }
      const result = await provision(device);
      if (!result.ok) {
        console.error(color(RED, result.error));
        process.exitCode = 1;
        return;
      }
      console.log(color(GREEN, `Cola "${result.queue}" creada para ${device.model || serial}.`));
      console.log(`  Enlázala con: ${BOLD}npm run printer -- enlazar kitchen ${result.queue}${OFF}`);
      return;
    }

    case 'probar': {
      const queue = rest[0] || null;
      console.log(`\nEnviando prueba a ${queue || 'la impresora detectada'}...\n`);
      const result = await printTestText({ queue });
      if (!result.submitted) {
        console.error(color(RED, `No se pudo enviar: ${result.reason}`));
        process.exitCode = 1;
        return;
      }
      if (result.printed === true) {
        const job = printJobs.getJob(result.jobId);
        const wait = job?.waitedMs != null ? ` (${job.waitedMs}ms)` : '';
        console.log(color(GREEN, `Impreso en ${result.queue}${wait}.`));
      } else if (result.printed === null) {
        console.log(color(YELLOW, `Enviado a ${result.queue}, pero no se puede confirmar si salió.`));
      } else {
        console.error(color(RED, `NO se imprimió: ${result.reason}`));
        process.exitCode = 1;
      }
      return;
    }

    case 'limpiar': {
      const result = await clearStuckJobs(rest[0] || null);
      if (result.cleared?.length) {
        console.log(color(GREEN, `Colas limpiadas: ${result.cleared.join(', ')}`));
      } else {
        console.log('No había trabajos atascados.');
      }
      for (const f of result.failed || []) {
        console.error(color(RED, `  ${f.queue}: ${f.error}`));
      }
      return;
    }

    case 'cola': {
      // Imprime a una cola indicada a mano, saltándose toda la resolución.
      const queue = rest[0];
      if (!queue) {
        console.error('Uso: npm run printer -- cola <nombre-de-cola>');
        process.exitCode = 1;
        return;
      }
      const { printBytes } = await import('./index.js');
      const bytes = Buffer.from([
        '\\x1b\\x40',
        'IMPRESION DIRECTA',
        `Cola: ${queue}`,
        new Date().toLocaleString('es-VE'),
        '\\x1d\\x56\\x41\\x00'
      ].join('\\n'), 'binary');
      const result = await printBytes({ bytes, queue, confirm: 'wait' });
      if (result.printed === true) console.log(color(GREEN, `Impreso en ${queue}.`));
      else if (result.printed === null) console.log(color(YELLOW, `Enviado a ${queue}, sin confirmación.`));
      else console.error(color(RED, `Falló: ${result.reason}`));
      return;
    }

    case 'trabajos': {
      for (const job of printJobs.listJobs({ limit: 20 })) {
        const estado = job.status === 'printed' ? color(GREEN, job.status)
          : job.status === 'failed' || job.status === 'stuck' ? color(RED, job.status) : color(YELLOW, job.status);
        console.log(`  ${String(job.createdAt).slice(11, 19)}  ${estado.padEnd(20)} ${String(job.role).padEnd(9)} ${job.queue || '-'}`);
        if (job.reason) console.log(`    ${color(DIM, job.reason)}`);
      }
      return;
    }

    default:
      await printDiagnostics();
  }
};

main().catch((error) => {
  console.error(color(RED, error?.message || String(error)));
  process.exitCode = 1;
});
