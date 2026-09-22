import { exec } from 'child_process';
import { promisify } from 'util';

// Helper para enviar comandas RAW a una impresora térmica Linux local.
const execAsync = promisify(exec);
const printerName = process.env.PRINTER_NAME || 'POS-80';
const PAPER_WIDTH = 48;
const CUT_SEQUENCE = '\\x1D\\x56\\x41\\x00';
const DOUBLE_HEIGHT_ON = '\\x1D\\x21\\x01';
const DOUBLE_HEIGHT_OFF = '\\x1D\\x21\\x00';
const BOLD_ON = '\\x1B\\x45\\x01';
const BOLD_OFF = '\\x1B\\x45\\x00';

const normalizeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const stripAccents = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u00C0-\u00FF]/g, char => ({
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
    'ñ': 'n', 'Ñ': 'N', 'ü': 'u', 'Ü': 'U',
    'ç': 'c', 'Ç': 'C'
  }[char] || char));

const toPrinterAscii = (value = '') => stripAccents(String(value))
  .replace(/[€£¥]/g, '$')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[^\x20-\x7E]/g, ' ')
  .trim();

const safeCurrency = (value) => {
  const amount = Number(value || 0);
  return `$ ${amount.toFixed(2)}`;
};

const getTimestamp = () => {
  const now = new Date();
  const date = now.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const time = now.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return { date, time };
};

const repeatChar = (char, length) => char.repeat(Math.max(0, Number(length) || 0));

const centerText = (text, width = PAPER_WIDTH) => {
  const cleanText = toPrinterAscii(text || '');
  const padding = Math.max(0, width - cleanText.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return `${' '.repeat(left)}${cleanText}${' '.repeat(right)}`;
};

const truncate = (value, maxLength) => {
  const text = toPrinterAscii(value || '').slice(0, maxLength);
  return text.padEnd(maxLength, ' ');
};

const rightAlign = (text, width) => {
  const cleanText = toPrinterAscii(text || '');
  return cleanText.length >= width ? cleanText.slice(0, width) : ' '.repeat(width - cleanText.length) + cleanText;
};

const leftAlign = (text, width) => {
  const cleanText = toPrinterAscii(text || '');
  return cleanText.length >= width ? cleanText.slice(0, width) : cleanText + ' '.repeat(width - cleanText.length);
};

const formatKitchenItem = (item) => {
  const quantity = Number(item.quantity ?? item.qty ?? 1);
  const name = normalizeText(item.name || item.product_name || item.item || 'Producto', 'Producto');
  const cleanName = toPrinterAscii(name).slice(0, 28);
  const line = `${quantity}x ${cleanName}`;
  const detail = item.nota || item.notes || item.note || item.description || item.observacion || item.observaciones;

  if (!detail) {
    return `${DOUBLE_HEIGHT_ON}${line}${DOUBLE_HEIGHT_OFF}`;
  }

  const cleanDetail = toPrinterAscii(detail).slice(0, 38);
  return `${DOUBLE_HEIGHT_ON}${line}${DOUBLE_HEIGHT_OFF}\n${BOLD_OFF}${DOUBLE_HEIGHT_OFF}   * NOTA: ${cleanDetail}`;
};

const formatCustomerItem = (item) => {
  const quantity = Number(item.quantity ?? item.qty ?? 1);
  const name = toPrinterAscii(item.name || item.product_name || item.item || 'Producto');
  const unitPrice = Number(item.unit_price ?? item.price ?? 0);
  const totalPrice = quantity * unitPrice;
  const qtyText = `${quantity}x`;
  const nameText = truncate(name, 18);
  const unitText = `$ ${unitPrice.toFixed(2)}`;
  const totalText = `$ ${totalPrice.toFixed(2)}`;
  return `${leftAlign(qtyText, 4)} ${leftAlign(nameText, 18)} ${rightAlign(unitText, 11)} ${rightAlign(totalText, 11)}`;
};

export function generarComandaCocina(order = {}, options = {}) {
  const restaurantName = normalizeText(options.restaurantName || order.restaurant_name || "GAUCHOS", 'GAUCHOS');
  const orderId = normalizeText(order.id || order.order_id || 'N/A');
  const customerName = normalizeText(order.customer_name || order.cliente || order.client || order.customer || '');
  const tableName = normalizeText(order.mesa || order.table || order.table_name || order.tableNumber || '');
  const items = Array.isArray(order.items) ? order.items : [];
  const { date, time } = getTimestamp();

  const lines = [
    centerText(`${restaurantName} - COMANDA COCINA`, PAPER_WIDTH),
    repeatChar('=', PAPER_WIDTH),
    `Pedido: ${orderId}`,
    `Fecha: ${date}`,
    `Hora: ${time}`,
  ];

  if (customerName) {
    lines.push(`Cliente: ${toPrinterAscii(customerName)}`);
  }

  if (tableName) {
    lines.push(`Mesa: ${toPrinterAscii(tableName)}`);
  }

  lines.push(repeatChar('-', PAPER_WIDTH));
  items.forEach(item => {
    lines.push(...formatKitchenItem(item).split('\n'));
    lines.push('');
  });

  if (!items.length) {
    lines.push('Sin productos registrados');
  }

  lines.push('');
  lines.push('');
  lines.push('');
  lines.push('');
  lines.push(CUT_SEQUENCE);

  return lines.join('\n');
}

export function generarCuentaCliente(order = {}, options = {}) {
  const restaurantName = normalizeText(options.restaurantName || order.restaurant_name || "GAUCHOS", 'GAUCHOS');
  const orderId = normalizeText(order.id || order.order_id || 'N/A');
  const customerName = normalizeText(order.customer_name || order.cliente || order.client || order.customer || '');
  const customerPhone = normalizeText(order.customer_phone || order.telefono || order.phone || '');
  const tableName = normalizeText(order.mesa || order.table_number || order.table || order.table_name || '');
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items = rawItems.map(item => {
    const cleanItem = { ...item };
    delete cleanItem.nota;
    delete cleanItem.nota_item;
    delete cleanItem.notes;
    delete cleanItem.note;
    delete cleanItem.description;
    delete cleanItem.observacion;
    delete cleanItem.observaciones;
    return cleanItem;
  });
  const subtotal = Number(order.subtotal ?? items.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? item.qty ?? 1);
    const unitPrice = Number(item.unit_price ?? item.price ?? 0);
    return sum + quantity * unitPrice;
  }, 0));
  const service = Number(order.service ?? 0);
  const tax = Number(order.tax ?? 0);
  const total = Number(order.total ?? subtotal + service + tax);
  const { date, time } = getTimestamp();

  const lines = [
    centerText(`${restaurantName} - CUENTA`, PAPER_WIDTH),
    repeatChar('=', PAPER_WIDTH),
    `Pedido: ${orderId}`,
    `Fecha: ${date}`,
    `Hora: ${time}`,
  ];

  if (customerName) lines.push(`Cliente: ${toPrinterAscii(customerName)}`);
  if (customerPhone) lines.push(`Tel: ${toPrinterAscii(customerPhone)}`);
  if (tableName) lines.push(`Mesa: ${toPrinterAscii(tableName)}`);

  lines.push(repeatChar('-', PAPER_WIDTH));
  lines.push(`${leftAlign('Cant', 4)} ${leftAlign('Producto', 18)} ${rightAlign('Precio', 11)} ${rightAlign('Total', 11)}`);

  items.forEach(item => {
    const quantity = Number(item.quantity ?? item.qty ?? 1);
    const name = toPrinterAscii(item.name || item.product_name || item.item || 'Producto');
    const unitPrice = Number(item.unit_price ?? item.price ?? 0);
    const totalPrice = quantity * unitPrice;
    const qtyText = `${quantity}x`;
    const nameText = truncate(name, 18);
    const unitText = `$ ${unitPrice.toFixed(2)}`;
    const totalText = `$ ${totalPrice.toFixed(2)}`;
    lines.push(`${leftAlign(qtyText, 4)} ${leftAlign(nameText, 18)} ${rightAlign(unitText, 11)} ${rightAlign(totalText, 11)}`);
    lines.push('');
  });

  lines.push(repeatChar('-', PAPER_WIDTH));
  lines.push(`${leftAlign('Subtotal', 18)} ${rightAlign('$ ' + subtotal.toFixed(2), 24)}`);

  if (service > 0) {
    lines.push(`${leftAlign('Servicio', 18)} ${rightAlign('$ ' + service.toFixed(2), 24)}`);
  }

  if (tax > 0) {
    lines.push(`${leftAlign('Impuestos', 18)} ${rightAlign('$ ' + tax.toFixed(2), 24)}`);
  }

  const activeRate = Number(order.tasa_bcv || order.bcv_rate || order.tasa || 852.41);
  const totalBs = Number(total * activeRate);
  lines.push(`${leftAlign('TOTAL', 18)} ${rightAlign('$ ' + total.toFixed(2), 24)}`);
  lines.push(`${leftAlign('TASA BCV', 18)} ${rightAlign(activeRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs/$', 24)}`);
  lines.push(`${leftAlign('TOTAL BS', 18)} ${rightAlign(totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs.', 24)}`);
  lines.push('');
  lines.push(centerText('*** NO DA DERECHO A CRÉDITO FISCAL ***', PAPER_WIDTH));
  lines.push('');
  lines.push('');
  lines.push('');
  lines.push(CUT_SEQUENCE);

  return lines.join('\n');
}

export function buildKitchenTicket(order = {}, options = {}) {
  return generarComandaCocina(order, options);
}

export async function sendKitchenTicket(order = {}, options = {}) {
  const printer = normalizeText(options.printerName || process.env.PRINTER_NAME || printerName, 'POS-80');
  const ticket = options.type === 'cliente'
    ? generarCuentaCliente(order, options)
    : generarComandaCocina(order, options);
  const safeTicket = String(ticket)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  const command = `printf '%b' "${safeTicket}" | lp -d ${printer} -o raw`;

  try {
    const result = await execAsync(command, { timeout: 20000, maxBuffer: 1024 * 1024 });
    return {
      success: true,
      printer,
      stdout: result.stdout,
      stderr: result.stderr,
      command,
    };
  } catch (error) {
    const message = error?.stderr || error?.message || 'No se pudo enviar la comanda a la impresora.';
    throw new Error(message);
  }
}
