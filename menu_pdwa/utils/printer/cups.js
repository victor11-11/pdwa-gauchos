// Provider CUPS (Linux / macOS).
//
// Todo lo que habla con `lp`, `lpstat`, `lpoptions` y `lpadmin` vive aqui.
// Se usa execFile con argumentos sueltos (no una cadena de shell), asi que un
// nombre de cola malicioso no puede inyectar comandos.

import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execFileAsync = promisify(execFile);
const EXEC_TIMEOUT_MS = 8000;
const SUBMIT_TIMEOUT_MS = 20000;

export const isCupsAvailable = () => {
  try {
    execFileSync('which', ['lpstat'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// Un destino de lp solo admite nombres sencillos. Cualquier otra cosa se
// rechaza antes de tocar el shell.
export const sanitizeQueueName = (value) => {
  const text = String(value ?? '').trim();
  return /^[A-Za-z0-9._\- ]{1,127}$/.test(text) ? text : null;
};

/** Usuario actual, usado para la regla de permisos de la cola. */
const currentUser = () => {
  try {
    return process.env.USER || process.env.LOGNAME || os.userInfo().username;
  } catch {
    return 'nobody';
  }
};

const run = async (bin, args, timeout = EXEC_TIMEOUT_MS) => {
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout, maxBuffer: 1024 * 1024 });
    return { ok: true, stdout: stdout || '' };
  } catch (error) {
    return { ok: false, stdout: '', stderr: error?.stderr || '', error: error?.message || String(error) };
  }
};

/** Ejecuta un comando CUPS y devuelve stdout, o '' si falla. */
export const cupsCommand = (bin, args, timeout) => run(bin, args, timeout);

/** Nombre de las colas configuradas. */
export async function listQueues() {
  const { ok, stdout } = await run('lpstat', ['-e']);
  if (!ok) return [];
  return stdout.split('\n').map(l => l.trim()).filter(Boolean);
}

export async function getDefaultQueue() {
  const { ok, stdout } = await run('lpstat', ['-d']);
  if (!ok) return null;
  const match = stdout.match(/:\s*(.+)/);
  return match ? match[1].trim() : null;
}

/** Descompone un device-uri: usb://fabricante/producto?serial=... */
export const parseDeviceUri = (uri) => {
  const text = String(uri || '').trim();
  if (!text) return null;
  const [scheme, rest = ''] = text.split('://');
  const [location, query = ''] = rest.split('?');
  const params = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    params[k.toLowerCase()] = decodeURIComponent(v);
  }
  const [manufacturer = '', product = ''] = location.split('/');
  return {
    raw: text,
    scheme: scheme.toLowerCase(),
    manufacturer: decodeURIComponent(manufacturer) || null,
    product: decodeURIComponent(product) || null,
    serial: params.serial || null,
    params
  };
};

/** lpoptions devuelve pares clave=valor; algunos valores vienen entre comillas. */
const parseAttributes = (text) => {
  const attributes = {};
  for (const chunk of String(text).split(/\s+(?=[a-zA-Z-]+=)/)) {
    const eq = chunk.indexOf('=');
    if (eq < 0) continue;
    const key = chunk.slice(0, eq);
    const value = chunk.slice(eq + 1).replace(/^['"]|['"]$/g, '');
    attributes[key] = value;
  }
  return attributes;
};

async function countPendingJobs(queue) {
  const { ok, stdout } = await run('lpstat', ['-W', 'not-completed', '-o', queue]);
  if (!ok) return 0;
  return stdout.split('\n').filter(l => l.trim()).length;
}

async function countCompletedJobs(queue) {
  const { ok, stdout } = await run('lpstat', ['-W', 'completed', '-o', queue]);
  if (!ok) return 0;
  return stdout.split('\n').filter(l => l.trim()).length;
}

/**
 * Detalles de una cola. Solo se apoya en atributos con nombre propio de CUPS
 * (independientes del idioma) para decidir estado; `lpstat -l` solo se usa
 * como apoyo porque su texto cambia con el idioma del sistema.
 */
export async function describeQueue(queue) {
  const safe = sanitizeQueueName(queue);
  if (!safe) return null;

  const [options, verbose, accepting, defaultQueue, listing] = await Promise.all([
    run('lpoptions', ['-p', safe]),
    run('lpstat', ['-v']),
    run('lpstat', ['-a']),
    getDefaultQueue(),
    listQueues()
  ]);

  // OJO: `lpoptions -p <cola>` devuelve codigo 0 y salida vacia tambien cuando
  // la cola no existe, asi que no sirve para decidir existencia. La lista de
  // `lpstat -e` si es la fuente fiable.
  const exists = listing.includes(safe);

  const attributes = options.ok && Object.keys(parseAttributes(options.stdout)).length
    ? parseAttributes(options.stdout)
    : null;

  let deviceUri = (attributes && attributes['device-uri']) || '';
  if (!deviceUri && verbose.ok) {
    const line = verbose.stdout.split('\n').find(l => l.includes(safe) && l.includes(':'));
    if (line) deviceUri = line.slice(line.indexOf(':') + 1).trim();
  }

  const [pending, completed] = await Promise.all([
    countPendingJobs(safe),
    countCompletedJobs(safe)
  ]);

  const isAccepting = accepting.ok
    ? accepting.stdout.split('\n').some(l => l.trim().startsWith(safe))
    : (attributes && attributes['printer-is-accepting-jobs']) === 'true';

  const attrs = attributes || {};

  return {
    queue: safe,
    exists,
    deviceUri,
    uri: parseDeviceUri(deviceUri),
    makeAndModel: attrs['printer-make-and-model'] || null,
    printerInfo: attrs['printer-info'] || null,
    printerType: Number(attrs['printer-type'] || 0),
    accepting: exists && isAccepting,
    printerState: attrs['printer-state'] || null,
    // CUPS 3 = idle, 4 = processing, 5 = stopped.
    idle: attrs['printer-state'] === '3',
    stopped: attrs['printer-state'] === '5',
    pendingJobs: pending,
    completedJobs: completed,
    isDefault: safe === defaultQueue,
    hasAttributes: Boolean(attributes)
  };
}

/**
 * Envia un archivo RAW a una cola. Devuelve el identificador del trabajo de
 * CUPS para poder seguirlo despues.
 *
 * OJO: que este metodo no lance NO significa que se haya impreso. lp solo
 * entrega el trabajo a la cola; de ahi en adelante puede quedarse atascado
 * esperando un dispositivo que no responde. Por eso existe confirmJob().
 */
export async function submitJob(queue, filePath, options = {}) {
  const safe = sanitizeQueueName(queue);
  if (!safe) return { ok: false, error: 'Nombre de cola no válido' };

  const args = ['-d', safe, '-o', 'raw'];
  if (options.copies) args.push('-n', String(options.copies));
  args.push(filePath);

  const { ok, stdout, stderr, error } = await run('lp', args, SUBMIT_TIMEOUT_MS);
  if (!ok) return { ok: false, error: stderr || error || 'lp falló' };

  // El mensaje de lp sale en español o ingles segun el idioma del sistema:
  //   "la id solicitada es Printer_POS-80-73 (1 archivo(s))"
  //   "request id is Printer_POS-80-73 (1 file(s))"
  // Se busca el identificador en cualquiera de los dos, y como respaldo se
  // toma el ultimo token con forma <cola>-<numero>.
  const match = stdout.match(/(?:request id is|id solicitada es)\s+(\S+)/i);
  let jobId = match ? match[1] : null;

  if (!jobId) {
    const fallback = stdout.match(/\b([A-Za-z0-9._\-]+-\d+)\b/);
    jobId = fallback ? fallback[1] : null;
  }

  return { ok: true, jobId, stdout };
}

/** ¿Sigue el trabajo en la cola? */
export async function isJobPending(queue, jobId) {
  const { ok, stdout } = await run('lpstat', ['-W', 'not-completed', '-o', queue]);
  if (!ok) return false;
  if (!jobId) return stdout.split('\n').some(l => l.trim());
  return stdout.split('\n').some(l => l.trim().startsWith(jobId));
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Estado de un trabajo segun CUPS: pending, completed o desconocido.
 *
 * Hace falta mas que "¿ya no esta pendiente?": un trabajo puede desaparecer de
 * la cola sin haberse impreso (cancelado, cola borrada, error al arrancar) y
 * confiar solo en la ausencia daria un "impreso" falso justo en los casos que mas
 * duelen.
 */
export async function getJobState(queue, jobId) {
  if (!jobId) return 'unknown';

  const [pending, completed] = await Promise.all([
    run('lpstat', ['-W', 'not-completed', '-o', queue]),
    run('lpstat', ['-W', 'completed', '-o', queue])
  ]);

  const has = (result) => result.ok && result.stdout.split('\n').some(l => l.trim().startsWith(jobId));
  if (has(pending)) return 'pending';
  if (has(completed)) return 'completed';
  return 'unknown';
}

/**
 * Espera a que el trabajo salga de la cola y confirma que se imprimio de verdad.
 *
 * Antes de este cambio la app decia "enviado" en cuanto lp aceptaba, que es
 * justo lo que paso con las 22 comandas atascadas: lp sale con codigo 0 y el
 * papel nunca salia.
 *
 * printed true  = CUPS marco el trabajo como completado
 * printed false = se agoto el tiempo y sigue esperando, o desaparecio
 * printed null  = no se puede saber en esta plataforma
 */
export async function confirmJob(queue, jobId, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 400;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await sleep(intervalMs);

    const pending = await isJobPending(queue, jobId);
    if (pending) continue;

    // Ya no esta pendiente. Ahora hay que averiguar si llego a imprimirse o si
    // simplemente desaparecio de la cola (cancelado, cola borrada, error).
    const state = await getJobState(queue, jobId);
    const waitedMs = Date.now() - started;

    if (state === 'completed') {
      return { printed: true, waitedMs, cupsWaitedMs: waitedMs, reason: null };
    }

    if (!jobId) {
      // Sin identificador no se puede distinguir. Se dice la verdad: no se sabe.
      return {
        printed: null,
        unknown: true,
        waitedMs,
        reason: 'El trabajo salió de la cola, pero sin identificador no se puede confirmar la impresión.'
      };
    }

    return {
      printed: false,
      waitedMs,
      reason: `El trabajo ${jobId} desapareció de la cola ${queue} sin llegar a imprimirse (posiblemente cancelado o con error).`
    };
  }

  return {
    printed: false,
    waitedMs: Date.now() - started,
    reason: `El trabajo ${jobId || ''} sigue en la cola tras ${Math.round(timeoutMs / 1000)}s. La impresora no está recibiendo los datos.`
  };
}

/** Cancela los trabajos pendientes de una cola (o de todas). */
export async function cancelJobs(queue) {
  const safe = sanitizeQueueName(queue);
  if (!safe) return { ok: false, error: 'Nombre de cola no válido' };
  const { ok, stdout, error } = await run('cancel', ['-a', safe]);
  return ok ? { ok: true, stdout } : { ok: false, error };
}

/**
 * Crea una cola RAW para un dispositivo USB. Es el paso que hoy hace una
 * persona a mano. No necesita saber la marca: cualquier ESC/POS sirve.
 * Requiere ser root o pertenecer al grupo `lp`.
 *
 * Importante: que esta función devuelva ok:true NO garantiza que la impresora
 * vaya a imprimir. CUPS acepta el device-uri aunque el equipo este desconectado.
 * La comprobacion de "esta conectada de verdad" vive en selection.js, que cruza
 * el serial con el hardware conectado.
 */
export async function provisionRawQueue(deviceUri, desiredName, options = {}) {
  const uri = String(deviceUri || '').trim();
  if (!/^usb:\/\//i.test(uri)) {
    return { ok: false, error: 'Solo se pueden aprovisionar dispositivos USB' };
  }

  const safe = sanitizeQueueName(desiredName);
  if (!safe) return { ok: false, error: 'Nombre de cola no válido' };

  const existing = await describeQueue(safe);
  if (existing && existing.exists) {
    return { ok: true, queue: safe, alreadyExisted: true, deviceUri: existing.deviceUri };
  }

  // CUPS acepta CUALQUIER device-uri aunque el equipo no este conectado: crea
  // la cola y la deja ahí. Por eso "se creó" NO significa "va a imprimir".
  // Quien decide si sirve para imprimir es bindQueueToDevice(), que cruza el
  // serial con el hardware realmente conectado. Aqui solo se crea y se
  // comprueba que CUPS la mantenga.

  const created = await run('lpadmin', ['-p', safe, '-E', '-v', uri, '-m', 'raw']);

  // CUPS reescribe printers.conf de forma asincrona: durante un instante lpadmin
  // ya salio con exito pero lpstat aun no ve la cola. Se reintenta la lectura
  // unos segundos antes de concluir nada, tanto en exito como en fallo.
  // Se espera poco entre intentos: si el equipo esta realmente desconectado la
  // cola nunca va a aparecer, y no tiene sentido tardar 17 s en decirlo.
  // Comportamiento real comprobado de CUPS 3: lpadmin acepta CUALQUIER device-uri
  // y escribe la cola, pero al recargarse descarta las colas cuyo backend usb://
  // apunta a un equipo que no esta conectado. Por eso no basta con comprobar
  // que lpadmin salio con exito: hay que verificar que la cola sigue ahi un
  // par de segundos despues.
  const confirmStable = async () => {
    // Una sola lectura ya basta: lpadmin reescribe printers.conf de forma
    // sincrona en la practica. Se lee dos veces para descartar una carrera
    // puntual, pero sin insistir: si la cola no aparece es que no se creó.
    const first = await describeQueue(safe);
    if (!first?.exists || !first.deviceUri) return { info: first, stable: false };

    await new Promise(r => setTimeout(r, options.settleMs ?? 600));
    const second = await describeQueue(safe);
    const stable = Boolean(second?.exists && second.deviceUri);
    return { info: stable ? second : second || first, stable };
  };

  const { info: verify, stable } = await confirmStable();

  if (!stable) {
    await run('lpadmin', ['-x', safe]);
    return {
      ok: false,
      error: `No se pudo crear la cola "${safe}". ${created.stderr ? created.stderr.trim() : created.error || ''}`.trim()
    };
  }

  // AVISO IMPORTANTE (bug real de lpadmin en CUPS 3, reproducido aqui):
  // `lpadmin -p <cola> -u allow:$USER` SIN repetir -v borra silenciosamente la
  // cola que se acaba de crear. lpadmin interpreta el -u como una
  // reconfiguracion completa y se queda sin destino.
  //
  // Por eso la regla de permisos se aplica SIEMPRE junto al -v original, y si
  // aun asi la cola desaparece, se vuelve a crear con permisos ya incluidos.
  const withPolicy = [...['-p', safe, '-E', '-v', verify.deviceUri, '-m', 'raw'], '-u', `allow:${currentUser()}`];
  await run('lpadmin', withPolicy);

  const finalCheck = await describeQueue(safe);
  if (!finalCheck.exists || !finalCheck.deviceUri) {
    await run('lpadmin', ['-p', safe, '-E', '-v', verify.deviceUri, '-m', 'raw']);
    const retry = await describeQueue(safe);
    if (!retry.exists || !retry.deviceUri) {
      return {
        ok: false,
        error: `La cola "${safe}" se creó pero CUPS no la mantiene. Revisa los permisos de impresión.`
      };
    }
    return { ok: true, queue: safe, deviceUri: retry.deviceUri };
  }

  return { ok: true, queue: safe, deviceUri: finalCheck.deviceUri };
}

/** Borra una cola. */
export async function removeQueue(queue) {
  const safe = sanitizeQueueName(queue);
  if (!safe) return { ok: false, error: 'Nombre de cola no válido' };
  const { ok, error } = await run('lpadmin', ['-x', safe]);
  return ok ? { ok: true } : { ok: false, error };
}