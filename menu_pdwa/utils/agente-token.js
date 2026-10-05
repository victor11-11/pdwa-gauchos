import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const raizProyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivoToken = path.join(raizProyecto, 'agente.token');

/**
 * Secreto compartido entre el servidor y el agente de impresión local.
 *
 * El socket es una puerta abierta a la impresora: por él pasan las comandas con
 * los nombres de los clientes y salen en papel. Si no se pide nada, cualquiera
 * que conozca la dirección se conecta, lee las comandas e imprime lo que quiera
 * en la ticketera del restaurante. Por eso el socket exige este secreto.
 *
 * De dónde sale:
 *   1. `AGENT_TOKEN` del entorno (así se hace cuando el servidor está en la nube
 *      y el agente en otro equipo: se copia el valor al agente).
 *   2. Un archivo `agente.token` junto al proyecto, creado la primera vez con un
 *      valor al azar. Sirve cuando servidor y agente están en el mismo equipo,
 *      que es el caso normal de una instalación local.
 */
export const resolveAgentToken = () => {
  const delEntorno = String(process.env.AGENT_TOKEN || '').trim();
  if (delEntorno) return { token: delEntorno, origen: 'entorno' };

  try {
    if (fs.existsSync(archivoToken)) {
      const guardado = fs.readFileSync(archivoToken, 'utf8').trim();
      if (guardado) return { token: guardado, origen: 'archivo' };
    }
  } catch {
    // Si no se puede leer, se genera uno nuevo: peor perdonar que dejar abierto.
  }

  const nuevo = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(archivoToken, `${nuevo}\n`, { mode: 0o600 });
  } catch (error) {
    console.warn(`⚠ No se pudo guardar agente.token (${error.message}). El servidor imprimirá el secreto en el log, pero cambiará en cada reinicio.`);
  }
  return { token: nuevo, origen: 'nuevo' };
};

/** Compara dos secretos sin filtrar, por mucho que se acerquen. */
export const mismoSecreto = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (!bufA.length || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const tokenEnArchivo = archivoToken;
