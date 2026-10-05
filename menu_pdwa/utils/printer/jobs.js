// Ciclo de vida de los trabajos de impresion.
//
// Antes: se llamaba a `lp` y se reportaba exito. lp solo entrega el trabajo a
// la cola, asi que el sistema afirmaba "comanda enviada" mientras el papel
// nunca salia. Aqui cada trabajo tiene estados reales y se llega hasta el
// final: printed, failed o stuck.

import { randomUUID } from 'crypto';

const MAX_JOBS = 200;

export const STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  PRINTED: 'printed',
  FAILED: 'failed',
  STUCK: 'stuck',
  UNCONFIRMABLE: 'unconfirmable'
};

// Historial en memoria. Vive en el agente local o en el proceso del servidor;
// si el proceso reinicia se pierde, y eso es aceptable: es diagnostico, no
// contabilidad.
const jobs = new Map();
const order = [];

const track = (job) => {
  if (!jobs.has(job.id)) order.push(job.id);
  jobs.set(job.id, job);
  while (order.length > MAX_JOBS) {
    const oldest = order.shift();
    jobs.delete(oldest);
  }
  return job;
};

export const patch = (id, changes) => {
  const job = jobs.get(id);
  if (!job) return null;
  const next = { ...job, ...changes, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  return next;
};

export const createJob = ({ role = null, queue = null, ticketType = null, orderId = null, bytes = null, device = null, via = 'local', agentJobId = null }) => track({
  id: randomUUID(),
  role,
  queue,
  ticketType,
  orderId,
  bytes,
  device,
  // `local` = este equipo imprimió; `socket` = lo delegó en el agente de otro
  // equipo. El panel lo muestra porque son fallos distintos: uno es un cable, el
  // otro es que el agente está apagado.
  via,
  status: STATUS.SENDING,
  cupsJobId: null,
  agentJobId,
  error: null,
  reason: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

export const getJob = (id) => jobs.get(id) || null;

export const listJobs = ({ limit = 50, status = null } = {}) => {
  const list = order
    .map(id => jobs.get(id))
    .filter(Boolean)
    .filter(job => !status || job.status === status)
    .reverse();
  return list.slice(0, limit);
};

/**
 * Confirma en segundo plano. El POS no espera por esto: la respuesta al
 * proveedor ya se dio y el resultado real llega despues por el log.
 */
export const confirmInBackground = (jobId, provider, options = {}) => {
  const job = jobs.get(jobId);
  if (!job) return;

  const queue = job.queue;
  if (!queue || typeof provider.confirmJob !== 'function') {
    patch(jobId, { status: STATUS.UNCONFIRMABLE, reason: 'El proveedor no permite confirmar la impresión' });
    return;
  }

  provider.confirmJob(queue, job.cupsJobId, options)
    .then(result => {
      if (result.printed === true) {
        patch(jobId, {
          status: STATUS.PRINTED,
          // waitedMs: cuánto tardó en salir de la cola. cupsWaitedMs: cuánto
          // tardó CUPS en confirmar la entrega al dispositivo.
          waitedMs: result.waitedMs ?? null,
          cupsWaitedMs: result.cupsWaitedMs ?? null,
          reason: null
        });
      } else if (result.printed === null || result.unknown) {
        patch(jobId, { status: STATUS.UNCONFIRMABLE, reason: result.reason || 'No se puede confirmar' });
      } else {
        // Se agoto el tiempo con el trabajo sigue en la cola: el dispositivo
        // no esta recibiendo. Se marca atascado para que se pueda limpiar.
        patch(jobId, { status: STATUS.STUCK, reason: result.reason || 'El trabajo no salió de la cola' });
      }
    })
    .catch(error => {
      patch(jobId, { status: STATUS.FAILED, error: error?.message || String(error) });
    });
};

/** Resumen para el panel. */
export const jobSummary = () => {
  const all = listJobs({ limit: MAX_JOBS });
  const byStatus = {};
  for (const job of all) byStatus[job.status] = (byStatus[job.status] || 0) + 1;
  const stuck = all.filter(j => j.status === STATUS.STUCK);
  return {
    total: all.length,
    byStatus,
    stuck: stuck.length,
    lastPrintedAt: all.find(j => j.status === STATUS.PRINTED)?.updatedAt || null,
    lastFailure: all.find(j => j.status === STATUS.FAILED || j.status === STATUS.STUCK) || null
  };
};

/** Trabajo Mas reciente en un rol, util para el diagnostico. */
export const lastJobForRole = (role) =>
  listJobs({ limit: MAX_JOBS }).find(j => j.role === role) || null;

export const clearJobs = () => {
  jobs.clear();
  order.length = 0;
};