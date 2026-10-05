import express from 'express';
import http from 'http';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import {
  generarComandaCocina,
  generarCuentaCliente,
  printTicket,
  printTestText,
  getDiagnostics,
  getInventory,
  resolveDestination,
  bindQueueToLogical,
  unbindLogical,
  provision,
  clearStuckJobs,
  listJobs,
  jobSummary,
  readLogicalPrinters,
  writeLogicalPrinters,
  invalidateInventory,
  createPrintJob,
  patchPrintJob,
  getJob
} from './utils/printer/index.js';

const createJob = createPrintJob;
const patchJob = patchPrintJob;
import { getRateStatus, loadRates, refreshIfStale, refreshRates, setActiveCurrency, startBCVUpdater } from './utils/bcv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'clave_secreta_super_segura_menu_2026';
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

/**
 * Envía el ticket al agente local y devuelve el resultado real que él confirme.
 *
 * Antes esto emitía y devolvía `printed: true` sin más: el servidor afirmaba una
 * impresión que no podía comprobar y que a menudo no ocurría. Ahora devuelve
 * false/null según lo que diga el agente.
 */
const emitRemoteTicket = async ({ tipo, datosEscPos, role, orderId, wait = false }) => {
  if (!datosEscPos) return { submitted: false, printed: false, reason: 'No se generó el ticket' };

  const agenteId = [...agenteInventario.keys()][0] || null;
  const connected = io.sockets.sockets.size;
  if (!connected) {
    return {
      submitted: false,
      printed: null,
      reason: 'No hay ningún agente de impresión conectado. Las comandas no se pueden imprimir a distancia.'
    };
  }

  const job = registerAgentJob({
    socketId: agenteId,
    role: role || (tipo === 'cliente' ? 'counter' : 'kitchen'),
    ticketType: tipo === 'cliente' ? 'receipt' : 'kitchen',
    orderId: orderId ?? null,
    ticket: datosEscPos
  });

  io.emit('imprimir_ticket', {
    tipo,
    datosEscPos,
    role: role || (tipo === 'cliente' ? 'counter' : 'kitchen'),
    jobId: job.id,
    // El agente decide si espera o no según esto: si el servidor va a
    // preguntar el resultado, el agente tiene que comprobarlo de verdad.
    wait: Boolean(wait)
  });

  if (!wait) {
    return { submitted: true, printed: null, jobId: job.id, reason: null };
  }

  const confirmation = await awaitAgentJob(job.id);
  const final = getJob(job.id);
  return {
    submitted: confirmation.status !== 'failed',
    printed: confirmation.status === 'printed' ? true : confirmation.status === 'unconfirmable' ? null : false,
    jobId: job.id,
    queue: final?.queue || 'agente-local',
    reason: confirmation.reason || null,
    status: confirmation.status
  };
};

const shouldUseSocketPrint = (req = null) => {
  const host = String((req?.headers?.host || process.env.HOST || 'localhost')).toLowerCase();
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').toLowerCase();
  const runtimeHost = String(process.env.HOST || '').toLowerCase();
  const isRender = Boolean(process.env.RENDER) || /onrender\.com|render\.com/.test(host) || /onrender\.com|render\.com/.test(forwardedHost) || /onrender\.com|render\.com/.test(runtimeHost);
  const isLocalHost = /localhost|127\.0\.0\.1|::1/.test(host) || /localhost|127\.0\.0\.1|::1/.test(forwardedHost) || /localhost|127\.0\.0\.1|::1/.test(runtimeHost);
  return isRender || (!isLocalHost && !req?.hostname?.includes('localhost'));
};

app.use(cors());
app.use(express.json());
// Express 5 deja req.body como undefined cuando la peticion no trae cuerpo
// JSON (por ejemplo un POST sin body). Sin esto, cualquier acceso directo a
// req.body.algo reventaba con 500.
app.use((req, res, next) => {
  if (req.body === undefined || req.body === null) req.body = {};
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------------
// Agente de impresión local (socket)
//
// Cuando la impresora vive en otro equipo (el del restaurante) el servidor no
// puede imprimir ni comprobar nada: se lo pide al agente y espera su respuesta.
// Por eso cada orden lleva un identificador, el agente lo devuelve al informar
// y el panel puede decir la verdad en vez de suponer que salió.
// ------------------------------------------------------------------

// Lo último que reportó cada agente, para mostrarlo en el panel.
const agenteInventario = new Map();

// Trabajos enviados al agente y aún sin respuesta (identificador -> {socketId}).
const trabajosEnAgente = new Map();

const PRINT_JOB_TIMEOUT_MS = 45000;

io.on('connection', (socket) => {
  console.log('🖨️ Agente de impresión conectado:', socket.id);

  socket.emit('inventario_solicitado', { solicitadoPor: socket.id });

  socket.on('inventario_impresoras', (payload) => {
    agenteInventario.set(socket.id, {
      ...payload,
      socketId: socket.id,
      recibidoEn: new Date().toISOString()
    });
    console.log(`📋 Agente ${payload?.agente || socket.id} reportó ${payload?.impresoras?.length ?? 0} impresora(s)`);
  });

  socket.on('job_estado', (payload) => {
    const jobId = payload?.serverJobId;
    if (!jobId) return;
    patchAgentJob(jobId, payload);
  });

  socket.on('consultar_job', (payload, reply) => {
    const job = payload?.agentJobId ? getJob(payload.agentJobId) : null;
    if (typeof reply === 'function') reply(job || null);
  });

  socket.on('disconnect', () => {
    agenteInventario.delete(socket.id);
    // Los trabajos enviados a este agente se quedan sin confirmar: es honesto
    // marcarlos, porque ya no hay quien diga si salieron.
    for (const [jobId, info] of trabajosEnAgente.entries()) {
      if (info.socketId !== socket.id) continue;
      trabajosEnAgente.delete(jobId);
      patchJob(jobId, {
        status: 'unconfirmable',
        reason: 'El agente de impresión se desconectó antes de confirmar el resultado.'
      });
    }
    console.log('🔌 Agente de impresión desconectado:', socket.id);
  });
});

/** Registra en el historial un trabajo del que el servidor solo sabe el envío. */
const registerAgentJob = ({ socketId, role, ticketType, orderId, ticket, requestId }) => {
  const created = createJob({
    role,
    queue: null,
    ticketType,
    orderId,
    bytes: ticket?.length ?? 0,
    device: 'agente-local',
    via: 'socket'
  });

  trabajosEnAgente.set(created.id, { socketId, requestId });
  return created;
};

const patchAgentJob = (jobId, payload) => {
  trabajosEnAgente.delete(jobId);
  const status = payload.status || (payload.printed === true ? 'printed' : payload.submitted ? 'sent' : 'failed');
  patchJob(jobId, {
    status,
    queue: payload.queue || null,
    agentJobId: payload.agentJobId || null,
    reason: payload.reason || null,
    error: payload.submitted ? null : (payload.reason || 'El agente no pudo imprimir')
  });
  console.log(`${status === 'printed' ? '🖨' : status === 'failed' ? '⚠️' : '…'} Agente informó ${jobId}: ${status}${payload.reason ? ` (${payload.reason})` : ''}`);
};

/** Espera la respuesta del agente, con límite de tiempo. */
const awaitAgentJob = (jobId) => new Promise((resolve) => {
  const deadline = Date.now() + PRINT_JOB_TIMEOUT_MS;
  const poll = () => {
    const job = getJob(jobId);
    if (!job || job.status === 'sending') {
      if (Date.now() < deadline) return setTimeout(poll, 250);
      return resolve({
        status: 'unconfirmable',
        reason: `El agente no respondió en ${Math.round(PRINT_JOB_TIMEOUT_MS / 1000)}s. La orden pudo imprimirse o no.`
      });
    }
    return resolve({ status: job.status, reason: job.reason, queue: job.queue });
  };
  poll();
});

startBCVUpdater();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const db = new Database(path.join(__dirname, 'database.sqlite'));
console.log('⚡ Conectado a la base de datos SQLite.');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'admin',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    isCustomizable INTEGER DEFAULT 0,
    isCustomPizza INTEGER DEFAULT 0,
    isCustomIceCream INTEGER DEFAULT 0,
    baseName TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    available INTEGER DEFAULT 1,
    customization_type TEXT DEFAULT 'simple',
    promo_free_extras INTEGER DEFAULT 0,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS pizza_sizes (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS extras (
    id TEXT PRIMARY KEY,
    type TEXT CHECK(type IN ('burger', 'pizza', 'icecream_topping', 'icecream_flavor')),
    name TEXT NOT NULL,
    price REAL DEFAULT 0.00,
    available INTEGER DEFAULT 1,
    included INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily_sales (
    sale_date TEXT PRIMARY KEY,
    total REAL DEFAULT 0,
    orders INTEGER DEFAULT 0,
    tables_served INTEGER DEFAULT 0,
    average_ticket REAL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pos_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'sent', 'paid', 'cancelled')),
    notes TEXT DEFAULT '',
    subtotal REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT '',
    opened_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS pos_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id TEXT,
    name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    description TEXT DEFAULT '',
    FOREIGN KEY(order_id) REFERENCES pos_orders(id) ON DELETE CASCADE
  );
`);

const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map(column => column.name);
if (!userColumns.includes('role')) db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'`);
if (!userColumns.includes('active')) db.exec(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`);
if (!userColumns.includes('created_at')) {
  db.exec(`ALTER TABLE users ADD COLUMN created_at TEXT`);
  db.exec(`UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`);
}

const productColumns = db.prepare(`PRAGMA table_info(products)`).all().map(column => column.name);
if (!productColumns.includes('description')) {
  db.exec(`ALTER TABLE products ADD COLUMN description TEXT`);
}
if (!productColumns.includes('available')) {
  db.exec(`ALTER TABLE products ADD COLUMN available INTEGER DEFAULT 1`);
}
if (!productColumns.includes('customization_type')) {
  db.exec(`ALTER TABLE products ADD COLUMN customization_type TEXT DEFAULT 'simple'`);
}
if (!productColumns.includes('promo_free_extras')) {
  db.exec(`ALTER TABLE products ADD COLUMN promo_free_extras INTEGER DEFAULT 0`);
}

const categoryColumns = db.prepare(`PRAGMA table_info(categories)`).all().map(column => column.name);
if (!categoryColumns.includes('isCustomizable')) db.exec(`ALTER TABLE categories ADD COLUMN isCustomizable INTEGER DEFAULT 0`);
if (!categoryColumns.includes('isCustomPizza')) db.exec(`ALTER TABLE categories ADD COLUMN isCustomPizza INTEGER DEFAULT 0`);
if (!categoryColumns.includes('isCustomIceCream')) db.exec(`ALTER TABLE categories ADD COLUMN isCustomIceCream INTEGER DEFAULT 0`);
if (!categoryColumns.includes('baseName')) db.exec(`ALTER TABLE categories ADD COLUMN baseName TEXT`);
if (!categoryColumns.includes('sort_order')) db.exec(`ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0`);

const extraColumns = db.prepare(`PRAGMA table_info(extras)`).all().map(column => column.name);
if (!extraColumns.includes('available')) db.exec(`ALTER TABLE extras ADD COLUMN available INTEGER DEFAULT 1`);
if (!extraColumns.includes('included')) db.exec(`ALTER TABLE extras ADD COLUMN included INTEGER DEFAULT 0`);

const orderItemColumns = db.prepare(`PRAGMA table_info(pos_order_items)`).all().map(column => column.name);
if (!orderItemColumns.includes('note')) db.exec(`ALTER TABLE pos_order_items ADD COLUMN note TEXT DEFAULT ''`);

// service y tax nunca se escribieron (siempre 0): se eliminan de cuentas existentes.
const posOrderColumns = db.prepare(`PRAGMA table_info(pos_orders)`).all().map(column => column.name);
for (const deadColumn of ['service', 'tax']) {
  if (posOrderColumns.includes(deadColumn)) {
    db.exec(`ALTER TABLE pos_orders DROP COLUMN ${deadColumn}`);
    console.log(`🧹 Columna eliminada de pos_orders: ${deadColumn}`);
  }
}

const extrasSchema = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'extras'`).get()?.sql || '';
if (!extrasSchema.includes('icecream_flavor')) {
  db.exec(`
    BEGIN;
    ALTER TABLE extras RENAME TO extras_legacy;
    CREATE TABLE extras (
      id TEXT PRIMARY KEY,
      type TEXT CHECK(type IN ('burger', 'pizza', 'icecream_topping', 'icecream_flavor')),
      name TEXT NOT NULL,
      price REAL DEFAULT 0.00,
      available INTEGER DEFAULT 1,
      included INTEGER DEFAULT 0
    );
    INSERT INTO extras (id, type, name, price, available, included)
    SELECT id, type, name, price, available, included FROM extras_legacy;
    DROP TABLE extras_legacy;
    COMMIT;
  `);
}

const userCheck = db.prepare(`SELECT * FROM users WHERE username = 'admin'`).get();
if (!userCheck) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (username, password) VALUES ('admin', ?)`).run(hash);
  console.log('👤 Usuario admin predeterminado creado (admin / admin123)');
}

const catCount = db.prepare(`SELECT COUNT(*) as count FROM categories`).get();
if (catCount.count === 0) {
  seedDatabase();
}

function seedDatabase() {
  console.log('🌱 Poblando base de datos inicial...');

  const insertCategory = db.prepare(`INSERT INTO categories (id, name, isCustomizable, isCustomPizza, isCustomIceCream, baseName, sort_order) VALUES (?,?,?,?,?,?,?)`);
  const cats = [
    ['promos', 'Promociones', 0, 0, 0, null, 1],
    ['hamburguesas', 'Hamburguesas', 1, 0, 0, null, 2],
    ['granjeros', 'Granjeros', 1, 0, 0, null, 3],
    ['entradas', 'Entradas / Para Compartir', 0, 0, 0, null, 4],
    ['ensaladas', 'Ensaladas', 0, 0, 0, null, 5],
    ['pizzas', 'Pizzas', 0, 1, 0, 'Margarita', 6],
    ['helados', 'Helados', 0, 0, 1, 'Helados Gourmet', 7],
    ['bebidas', 'Bebidas', 0, 0, 0, null, 8]
  ];
  cats.forEach(c => insertCategory.run(c));

  const insertProduct = db.prepare(`INSERT INTO products (id, category_id, name, price, description, available, customization_type, promo_free_extras) VALUES (?,?,?,?,?,?,?,?)`);
  const prods = [
    ['promo1', 'promos', 'Combo Pareja (2 Burgers Res + Refresco 1L)', 13.50, 'Incluye 2 hamburguesas de res sencillas y refresco de 1 litro.', 1, 'simple', 0],
    ['promo2', 'promos', 'Mega Pizza + Tequeños', 15.00, 'Pizza grande de 1 ingrediente + ración de 5 tequeños.', 1, 'promo_pizza', 1],
    ['h1', 'hamburguesas', 'Res', 6.50, null, 1],
    ['h2', 'hamburguesas', 'Pollo Crispy', 7.00, null, 1],
    ['h3', 'hamburguesas', 'Gaucho', 8.00, null, 1],
    ['h4', 'hamburguesas', 'Gaucho a Caballo', 8.50, null, 1],
    ['h5', 'hamburguesas', 'Punta', 9.00, null, 1],
    ['h6', 'hamburguesas', 'Super Crispy', 8.00, null, 1],
    ['g1', 'granjeros', 'Pollo Crispy', 6.00, null, 1],
    ['g2', 'granjeros', 'Lomito', 7.50, null, 1],
    ['g3', 'granjeros', 'Lomito con Champiñones', 8.00, null, 1],
    ['g4', 'granjeros', 'Atún', 6.00, null, 1],
    ['g5', 'granjeros', 'Pollo Teriyaki', 7.00, null, 1],
    ['g6', 'granjeros', 'Pollo a la Plancha', 6.50, null, 1],
    ['e1', 'entradas', 'Nachos', 5.50, null, 1],
    ['e2', 'entradas', 'Papas con Chili', 6.00, null, 1],
    ['e3', 'entradas', 'Carpaccio de Lomito', 9.00, null, 1],
    ['e4', 'entradas', 'Tequeños', 5.00, null, 1],
    ['e5', 'entradas', 'Ración de Papas Fritas', 3.50, null, 1],
    ['e6', 'entradas', 'Tenders de Pollo', 6.50, null, 1],
    ['ens1', 'ensaladas', 'César', 6.00, null, 1],
    ['ens2', 'ensaladas', 'D\'Roma', 7.00, null, 1],
    ['ice1', 'helados', 'Tinita', 2.00, 'Tinita tradicional de 1 bola con sirope.', 1, 'icecream', 0],
    ['ice2', 'helados', 'Barquilla', 2.50, 'Barquilla crocante con 1 bola a elección.', 1, 'icecream', 0],
    ['ice3', 'helados', 'Tina 8 oz', 4.00, 'Tina individual de 8oz (hasta 2 sabores).', 1, 'icecream', 0],
    ['ice4', 'helados', 'Tina 16 oz', 7.50, 'Tina familiar de 16oz (hasta 3 sabores).', 1, 'icecream', 0],
    ['ice5', 'helados', 'Tina 36 oz', 13.00, 'Tina familiar grande de 36oz.', 1, 'icecream', 0],
    ['ice6', 'helados', 'Brownie con helado', 6.50, 'Brownie caliente acompañado con helado.', 1, 'icecream', 0],
    ['b1', 'bebidas', 'Refresco de Lata', 1.50, null, 1],
    ['b2', 'bebidas', 'Refresco Botella 300ml', 1.25, null, 1],
    ['b3', 'bebidas', 'Refresco 1L', 2.50, null, 1],
    ['b4', 'bebidas', 'Refresco 1.5L', 3.00, null, 1],
    ['b5', 'bebidas', 'Cervezas', 2.00, null, 1],
    ['b6', 'bebidas', 'Jugos Naturales', 2.00, null, 1],
    ['b7', 'bebidas', 'Agua Mineral', 1.00, null, 1]
  ];
  prods.forEach(p => insertProduct.run(...(p.length >= 8 ? p : [...p, 'simple', 0])));

  const insertSize = db.prepare(`INSERT INTO pizza_sizes VALUES (?,?,?,?)`);
  insertSize.run(['mediana', 'pizzas', 'Mediana', 8.00]);
  insertSize.run(['grande', 'pizzas', 'Grande', 12.00]);

  const insertExtra = db.prepare(`INSERT INTO extras (id, type, name, price, available, included) VALUES (?,?,?,?,1,?)`);
  const extrasList = [
    ['tocineta', 'burger', 'Tocineta', 1.50],
    ['queso', 'burger', 'Queso Extra', 1.00],
    ['huevo', 'burger', 'Huevo', 1.00],
    ['jamon', 'pizza', 'Jamón', 1.50],
    ['maiz', 'pizza', 'Maíz', 1.00],
    ['tocino', 'pizza', 'Tocino', 2.00],
    ['extra_queso', 'pizza', 'Extra Queso', 2.00],
    ['f_chocolate', 'icecream_flavor', 'Chocolate', 0.00],
    ['f_mantecado', 'icecream_flavor', 'Mantecado', 0.00],
    ['f_fresa', 'icecream_flavor', 'Fresa', 0.00],
    ['f_oreo', 'icecream_flavor', 'Oreo', 0.00],
    ['t_chispas', 'icecream_topping', 'Chispas de Chocolate', 0.50],
    ['t_mani', 'icecream_topping', 'Maní Crocante', 0.50],
    ['t_sirope_choc', 'icecream_topping', 'Sirope de Chocolate', 0.25],
    ['t_sirope_fresa', 'icecream_topping', 'Sirope de Fresa', 0.25]
  ];
  extrasList.forEach(ex => insertExtra.run(...ex, ex[1] === 'icecream_flavor' ? 1 : 0));
}

const ensureCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (id, name, isCustomizable, isCustomPizza, isCustomIceCream, baseName, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
ensureCategory.run('promos', 'Promociones', 0, 0, 0, null, 1);
ensureCategory.run('pizzas', 'Pizzas', 0, 1, 0, 'Margarita', 6);
ensureCategory.run('helados', 'Helados', 0, 0, 1, 'Helados Gourmet', 7);

const ensurePizzaSize = db.prepare(`INSERT OR IGNORE INTO pizza_sizes (id, category_id, name, price) VALUES (?, ?, ?, ?)`);
ensurePizzaSize.run('mediana', 'pizzas', 'Mediana', 8.00);
ensurePizzaSize.run('grande', 'pizzas', 'Grande', 12.00);

const ensureExtra = db.prepare(`INSERT OR IGNORE INTO extras (id, type, name, price) VALUES (?, ?, ?, ?)`);
ensureExtra.run('jamon', 'pizza', 'Jamón', 1.50);
ensureExtra.run('maiz', 'pizza', 'Maíz', 1.00);
ensureExtra.run('tocino', 'pizza', 'Tocino', 2.00);
ensureExtra.run('extra_queso', 'pizza', 'Extra Queso', 2.00);

const insertMissingProduct = db.prepare(`
  INSERT OR IGNORE INTO products (id, category_id, name, price, description, available, customization_type, promo_free_extras)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
insertMissingProduct.run('ice5', 'helados', 'Tina 36 oz', 13.00, 'Tina familiar grande de 36oz.', 1, 'icecream', 0);
insertMissingProduct.run('ice6', 'helados', 'Brownie con helado', 6.50, 'Brownie caliente acompañado con helado.', 1, 'icecream', 0);
db.prepare(`UPDATE products SET customization_type = 'icecream' WHERE category_id = 'helados' AND (customization_type IS NULL OR customization_type = 'simple')`).run();
db.prepare(`UPDATE products SET customization_type = 'promo_pizza', promo_free_extras = 1 WHERE id = 'promo2'`).run();
db.prepare(`UPDATE extras SET included = 1, price = 0 WHERE type = 'icecream_flavor'`).run();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso denegado' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
}

app.get('/api/menu', (req, res) => {
  try {
    const categories = db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC`).all();
    const products = db.prepare(`SELECT * FROM products WHERE available = 1`).all();
    const sizes = db.prepare(`SELECT * FROM pizza_sizes`).all();
    const extras = db.prepare(`SELECT * FROM extras WHERE available = 1`).all();

    const fullMenu = categories.map(cat => {
      const categoryData = {
        id: cat.id,
        name: cat.name,
        isCustomizable: Boolean(cat.isCustomizable),
        isCustomPizza: Boolean(cat.isCustomPizza),
        isCustomIceCream: Boolean(cat.isCustomIceCream)
      };

      if (cat.isCustomPizza) {
        categoryData.baseName = cat.baseName;
        categoryData.sizes = sizes.filter(s => s.category_id === cat.id);
        categoryData.extras = extras.filter(e => e.type === 'pizza');
      } else {
        categoryData.products = products.filter(p => p.category_id === cat.id).map(product => ({
          ...product,
          promo_free_extras: Boolean(product.promo_free_extras)
        }));
      }

      return categoryData;
    });

    res.json({
      menu: fullMenu,
      burgerExtras: extras.filter(e => e.type === 'burger'),
      iceCreamFlavors: extras.filter(e => e.type === 'icecream_flavor'),
      iceCreamToppings: extras.filter(e => e.type === 'icecream_topping')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasas', async (req, res) => {
  try {
    // Si la tasa está vencida se refresca en segundo plano: el cliente
    // siempre recibe algo y se corrige solo sin que el usuario pulse nada.
    refreshIfStale().catch(() => {});
    const rates = await loadRates();
    const status = getRateStatus();
    res.json({
      ...rates,
      ultimo_error: status.ultimo_error || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo cargar la tasa BCV' });
  }
});

app.post('/api/tasas/actualizar', async (req, res) => {
  try {
    const rates = await refreshRates();
    res.json({ ok: true, ...rates, message: 'Tasas BCV actualizadas' });
  } catch (error) {
    const current = await loadRates();
    res.status(502).json({
      error: `No se pudo actualizar la tasa BCV: ${error.message}`,
      tasa_en_uso: current.tasa_usd,
      ultima_actualizacion: current.ultima_actualizacion
    });
  }
});

app.put('/api/tasas/moneda', async (req, res) => {
  try {
    const { moneda } = req.body || {};
    const rates = await setActiveCurrency(moneda || 'USD');
    res.json({ ok: true, ...rates, message: 'Moneda activa actualizada' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo actualizar la moneda activa' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    if (!user || !user.active) return res.status(400).json({ error: 'Usuario incorrecto o inactivo' });

    const validPass = bcrypt.compareSync(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
  try {
    const today = db.prepare(`SELECT date('now', 'localtime') AS sale_date`).get().sale_date;
    const summary = db.prepare(`SELECT sale_date, total, orders, tables_served, average_ticket FROM daily_sales WHERE sale_date = ?`).get(today);
    res.json(summary || {
      sale_date: today,
      total: 0,
      orders: 0,
      tables_served: 0,
      average_ticket: 0,
      orders_list: []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sales', authenticateToken, (req, res) => {
  const total = Number(req.body.total);
  const tablesServed = Number(req.body.tablesServed) || 0;
  if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: 'El total de la venta debe ser mayor que cero' });

  try {
    const today = db.prepare(`SELECT date('now', 'localtime') AS sale_date`).get().sale_date;
    db.prepare(`
      INSERT INTO daily_sales (sale_date, total, orders, tables_served, average_ticket, updated_at)
      VALUES (?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(sale_date) DO UPDATE SET
        total = daily_sales.total + excluded.total,
        orders = daily_sales.orders + 1,
        tables_served = daily_sales.tables_served + excluded.tables_served,
        average_ticket = (daily_sales.total + excluded.total) / (daily_sales.orders + 1),
        updated_at = CURRENT_TIMESTAMP
    `).run(today, total, tablesServed, total);
    res.json({ message: 'Venta registrada', sale_date: today });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getPosOrder(orderId) {
  const order = db.prepare(`SELECT * FROM pos_orders WHERE id = ?`).get(orderId);
  if (!order) return null;
  order.items = db.prepare(`SELECT id, product_id, name, unit_price, quantity, description, note FROM pos_order_items WHERE order_id = ? ORDER BY id`).all(orderId);
  return order;
}

function releasePosTableByNumber(tableNumber) {
  const table = Number(tableNumber);
  if (!Number.isInteger(table) || table < 1 || table > 14) {
    return { released: false, message: 'La mesa debe estar entre 1 y 14' };
  }

  const openOrders = db.prepare(`SELECT id, table_number FROM pos_orders WHERE table_number = ? AND status IN ('open', 'sent') ORDER BY updated_at DESC`).all(table);
  if (!openOrders.length) {
    return { released: false, tableNumber: table, message: 'La mesa ya está libre' };
  }

  const ids = openOrders.map(order => order.id);
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM pos_order_items WHERE order_id IN (${placeholders})`).run(...ids);
  db.prepare(`UPDATE pos_orders SET status = 'cancelled', subtotal = 0, total = 0, notes = '', payment_method = '', updated_at = CURRENT_TIMESTAMP, closed_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).run(...ids);

  return { released: true, tableNumber: table, orderIds: ids, message: `Mesa ${table} liberada` };
}

function closePosOrderById(orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id)) {
    return { released: false, message: 'ID de pedido inválido' };
  }

  const current = getPosOrder(id);
  if (!current) {
    return { released: false, message: 'Pedido no encontrado' };
  }

  db.prepare(`DELETE FROM pos_order_items WHERE order_id = ?`).run(id);
  db.prepare(`UPDATE pos_orders SET status = 'cancelled', subtotal = 0, total = 0, notes = '', payment_method = '', updated_at = CURRENT_TIMESTAMP, closed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);

  return { released: true, orderId: id, tableNumber: current.table_number, message: `Mesa ${current.table_number} liberada` };
}

app.get('/api/admin/pos/tables', authenticateToken, (req, res) => {
  try {
    const orders = db.prepare(`SELECT o.*, COUNT(i.id) AS item_count FROM pos_orders o LEFT JOIN pos_order_items i ON i.order_id = o.id WHERE o.status IN ('open', 'sent') GROUP BY o.id ORDER BY o.table_number`).all();
    const validOrders = orders.filter(order => Number(order.item_count || 0) > 0 || Number(order.total || 0) > 0);
    const activeOrders = new Map(validOrders.map(order => [order.table_number, order]));
    res.json(Array.from({ length: 14 }, (_, index) => {
      const tableNumber = index + 1;
      const order = activeOrders.get(tableNumber);
      return { number: tableNumber, status: order ? order.status : 'available', order: order || null };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/pos/tables/:tableNumber/liberar', authenticateToken, (req, res) => {
  const result = releasePosTableByNumber(req.params.tableNumber);
  if (!result.released) {
    return result.message === 'La mesa ya está libre'
      ? res.status(200).json({ ok: true, ...result })
      : res.status(400).json({ error: result.message });
  }
  res.status(200).json({ ok: true, ...result });
});

app.post('/api/pedidos/:id/cerrar', authenticateToken, (req, res) => {
  const result = closePosOrderById(req.params.id);
  if (!result.released) return res.status(400).json({ error: result.message });
  res.status(200).json({ ok: true, ...result });
});

app.post('/api/admin/pos/orders', authenticateToken, (req, res) => {
  const tableNumber = Number(req.body.tableNumber);
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 14) return res.status(400).json({ error: 'La mesa debe estar entre 1 y 14' });
  try {
    const existing = db.prepare(`SELECT id FROM pos_orders WHERE table_number = ? AND status IN ('open', 'sent')`).get(tableNumber);
    if (existing) return res.json(getPosOrder(existing.id));
    const result = db.prepare(`INSERT INTO pos_orders (table_number, opened_by) VALUES (?, ?)`).run(tableNumber, req.user.username);
    res.status(201).json(getPosOrder(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/pos/orders/:id', authenticateToken, (req, res) => {
  const order = getPosOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json(order);
});

function buildPosPrintPayload(order, req, type = 'kitchen', rates = {}) {
  const normalizedType = String(type || 'kitchen').toLowerCase();
  // Express 5 deja req.body en undefined cuando la peticion no trae cuerpo JSON.
  const body = req.body || {};
  const activeCurrency = String(rates.moneda_activa || 'USD').toUpperCase();
  const tasaActiva = activeCurrency === 'EUR' ? rates.tasa_eur : rates.tasa_usd;
  const tasaActivaTexto = activeCurrency === 'EUR' ? rates.tasa_eur_texto : rates.tasa_usd_texto;
  return {
    ...order,
    id: order.id,
    customer_name: body.customer_name || `Mesa ${order.table_number}`,
    customer_phone: body.customer_phone || '',
    customer_address: body.customer_address || '',
    gps_url: body.gps_url || '',
    notes: order.notes || body.notes || '',
    items: (Array.isArray(order.items) ? order.items : []).map(item => {
      const cleanItem = { ...item };
      if (normalizedType === 'cliente') {
        delete cleanItem.nota;
        delete cleanItem.nota_item;
        delete cleanItem.notes;
        delete cleanItem.note;
        delete cleanItem.description;
        delete cleanItem.observacion;
        delete cleanItem.observaciones;
      } else {
        cleanItem.note = cleanItem.note || cleanItem.nota || cleanItem.notes || cleanItem.observacion || cleanItem.observaciones || '';
      }
      return {
        ...cleanItem,
        quantity: Number(cleanItem.quantity || 1),
        unit_price: Number(cleanItem.unit_price || cleanItem.price || 0),
        price: Number(cleanItem.unit_price || cleanItem.price || 0),
        name: cleanItem.name || 'Producto',
        description: normalizedType === 'cliente' ? '' : (cleanItem.description || ''),
        note: normalizedType === 'cliente' ? '' : (cleanItem.note || '')
      };
    }),
    subtotal: Number(order.subtotal || 0),
    total: Number(order.total || 0),
    tasa_bcv: Number(tasaActiva || 0),
    tasa_bcv_texto: tasaActivaTexto || '',
    printType: normalizedType
  };
}

app.post('/api/pedidos/:id/imprimir', authenticateToken, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'ID de pedido inválido' });

  try {
    const order = getPosOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const requestedType = String(req.body.tipo || req.body.type || 'kitchen').toLowerCase();
    const printType = requestedType === 'cuenta' || requestedType === 'cliente' ? 'cliente' : 'kitchen';
    const payload = buildPosPrintPayload(order, req, printType, await loadRates());

    if (shouldUseSocketPrint(req)) {
      const nombre = process.env.BUSINESS_NAME || 'Gauchos';
      const datosEscPos = printType === 'cliente'
        ? generarCuentaCliente(payload, { restaurantName: nombre, type: printType })
        : generarComandaCocina(payload, { restaurantName: nombre, type: printType });

      // No se espera al agente: la toma de pedidos no puede depender de que la
      // impresora esté encendida. El resultado llega por el historial.
      const result = await emitRemoteTicket({ tipo: printType, datosEscPos, orderId: order.id, role: printType === 'cliente' ? 'counter' : 'kitchen' });

      return res.json({
        success: true,
        submitted: result.submitted,
        printed: result.printed,
        message: result.submitted
          ? (printType === 'cliente' ? 'Cuenta enviada a la ticketera.' : 'Comanda enviada a la ticketera.')
          : (result.reason || 'No hay ticketera conectada.'),
        printer: 'agente-local',
        printerSource: 'socket',
        jobId: result.jobId || null,
        orderId: order.id,
        printType
      });
    }

    // La impresion nunca bloquea la toma del pedido: se responde en cuanto el
    // trabajo entro en la cola y el resultado real se consulta despues en
    // /api/admin/printers/jobs.
    const result = await printTicket({
      role: printType === 'cliente' ? 'counter' : 'kitchen',
      ticketType: printType === 'cliente' ? 'receipt' : 'kitchen',
      order: payload,
      confirm: 'background'
    });

    res.json({
      success: true,
      submitted: result.submitted,
      printed: result.printed,
      message: result.submitted
        ? (printType === 'cliente' ? 'Cuenta enviada a la cola de impresión.' : 'Comanda enviada a la cola de impresión.')
        : (result.reason || 'No hay impresora disponible: el ticket se generó pero no se imprimió.'),
      printer: result.queue || null,
      printerSource: result.source || null,
      jobId: result.jobId || null,
      orderId: order.id,
      printType
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No se pudo imprimir la comanda' });
  }
});

app.post('/api/pedidos/:id/imprimir-cuenta', authenticateToken, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'ID de pedido inválido' });

  try {
    const order = getPosOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const payload = buildPosPrintPayload(order, req, 'cliente', await loadRates());

    if (shouldUseSocketPrint(req)) {
      const datosEscPos = generarCuentaCliente(payload, {
        restaurantName: process.env.BUSINESS_NAME || 'Gauchos',
        type: 'cliente'
      });

      const result = await emitRemoteTicket({ tipo: 'cliente', datosEscPos, orderId: order.id, role: 'counter' });

      return res.json({
        success: true,
        submitted: result.submitted,
        printed: result.printed,
        message: result.submitted
          ? 'Cuenta enviada a la ticketera.'
          : (result.reason || 'No hay ticketera conectada.'),
        printer: 'agente-local',
        printerSource: 'socket',
        jobId: result.jobId || null,
        orderId: order.id,
        printType: 'cliente'
      });
    }

    const result = await printTicket({
      role: 'counter',
      ticketType: 'receipt',
      order: payload,
      confirm: 'background'
    });

    res.json({
      success: true,
      submitted: result.submitted,
      printed: result.printed,
      message: result.submitted ? 'Cuenta enviada a la cola de impresión.' : (result.reason || 'No hay impresora disponible: la cuenta se generó pero no se imprimió.'),
      printer: result.queue || null,
      printerSource: result.source || null,
      jobId: result.jobId || null,
      orderId: order.id,
      printType: 'cliente'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No se pudo imprimir la cuenta' });
  }
});

/** Pedido de ejemplo para la prueba de impresión, con la tasa real del momento. */
const buildPrintSample = async () => {
  const rates = await loadRates();
  return {
    id: 'PRUEBA',
    table_number: 1,
    customer_name: 'Prueba de impresión',
    notes: 'Ticket de verificación del sistema',
    items: [
      { name: 'Hamburguesa Gaucho', quantity: 1, unit_price: 8.5, description: 'Sin cebolla' },
      { name: 'Refresco 1L', quantity: 2, unit_price: 2.5, description: 'Bebida' }
    ],
    total: 13.5,
    tasa_bcv: Number(rates.moneda_activa === 'EUR' ? rates.tasa_eur : rates.tasa_usd),
    tasa_bcv_texto: String(rates.moneda_activa === 'EUR' ? rates.tasa_eur_texto : rates.tasa_usd_texto)
  };
};

// ------------------------------------------------------------------
// Panel de impresoras
//
// El punto de partida es `diagnostico`, que cruza lo que CUPS cree que
// existe con el hardware USB realmente conectado. Todo lo demas (aprovisionar,
// enlazar, probar) parte de ahi.
// ------------------------------------------------------------------

app.get('/api/admin/printers', authenticateToken, async (req, res) => {
  try {
    // Cada consulta manual del panel lee fresco, sin caché: el usuario acaba
    // de enchufar algo y necesita ver la realidad ahora.
    const [inventory, logical, jobsSummary] = await Promise.all([
      getInventory({ force: true }),
      readLogicalPrinters(),
      Promise.resolve(jobSummary())
    ]);

    // Para cada rol se resuelve el destino AHORA, con el inventario ya leído
    // fresco. Así el panel muestra de dónde viene cada asignación: automática,
    // elegida a mano, o una que quedó obsoleta porque desenchufaron el equipo.
    const logicas = [];
    for (const printer of logical) {
      const resolved = await resolveDestination({ role: printer.id, inventory });
      const entry = inventory.printers.find(p => p.queue === resolved.queue);
      logicas.push({
        id: printer.id,
        label: printer.label,
        role: printer.role,
        enabled: printer.enabled,
        requireConnected: printer.requireConnected,
        colaActual: resolved.queue || null,
        estadoVinculada: resolved.queue ? (entry?.binding?.status || 'unknown') : null,
        origen: resolved.source,
        motivo: resolved.reason || null,
        aviso: resolved.warning || (resolved.staleQueue ? `El enlace anterior (${resolved.staleQueue}) ya no sirve.` : null)
      });
    }

    res.json({
      plataforma: inventory.platform,
      cupsDisponible: inventory.cupsAvailable,
      usbDisponible: inventory.usbAvailable,
      recomendada: inventory.recommend,
      nota: inventory.note || null,
      impresoras: inventory.printers.map(p => ({
        cola: p.queue,
        existe: p.exists,
        modelo: p.binding?.device?.model || p.printerInfo || null,
        marca: p.binding?.device?.vendorLabel || null,
        usb: p.binding?.device?.vidPid || null,
        serial: p.binding?.device?.serial || null,
        tipo: p.binding?.device?.kind || null,
        estado: p.binding?.status,
        motivo: p.binding?.reason,
        deviceUri: p.deviceUri || null,
        aceptaTrabajos: p.accepting,
        CUPSstate: p.printerState || null,
        pendientes: p.pendingJobs,
        enviados: p.completedJobs,
        esDefault: p.isDefault,
        puntaje: p.score,
        senales: p.signals || [],
        termica: p.termica?.termica ?? null,
        certezaTermica: p.termica?.certeza || null,
        motivoTermica: p.termica?.motivo || null
      })),
      sinAprovisionar: inventory.unprovisionedDevices.map(d => ({
        modelo: d.model,
        marca: d.vendorLabel,
        usb: d.vidPid,
        serial: d.serial,
        tipo: d.kind,
        uri: d.cupsUri
      })),
      // Varias colas sobre el mismo equipo: solo una puede imprimir. Es el
      // error de instalación que más se confunde con "la impresora falla".
      duplicadas: (inventory.duplicates || []).map(d => ({
        serial: d.serial,
        modelo: d.modelo,
        colas: d.colas,
        activa: d.activa,
        aviso: d.aviso
      })),
      avisos: inventory.warnings || [],
      logicas,
      resumenTrabajos: jobsSummary,
      // Si la impresora vive en otro equipo, el servidor no la ve: la info llega
      // desde el agente de ese equipo y se muestra aparte para no mezclarla con
      // las colas locales, que no son las mismas.
      agente: agenteInventario.size
        ? {
          conectado: true,
          nombre: [...agenteInventario.values()][0]?.agente || null,
          plataforma: [...agenteInventario.values()][0]?.plataforma || null,
          impresoras: [...agenteInventario.values()][0]?.impresoras || [],
          logicas: [...agenteInventario.values()][0]?.logicas || [],
          actualizado: [...agenteInventario.values()][0]?.recibidoEn || null
        }
        : { conectado: false, impresoras: [], logicas: [] },
      // Dónde se imprime de verdad. Es la pregunta que un dueño se hace al ver
      // una lista de impresoras, así que se responde explícitamente.
      notaImpresion: agenteInventario.size
        ? `Las comandas se envían a la ticketera del agente «${[...agenteInventario.values()][0]?.agente}». Las colas de este equipo son de referencia: quien imprime está allí.`
        : 'Este equipo imprime directamente. Las colas de abajo son las suyas.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo leer el inventario de impresoras' });
  }
});

app.get('/api/admin/printers/diagnostico', authenticateToken, async (req, res) => {
  try {
    res.json(await getDiagnostics());
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo diagnosticar la impresora' });
  }
});

// Alias antiguo, para no romper clientes ya instalados.
app.get('/api/admin/printer/diagnostico', authenticateToken, async (req, res) => {
  try {
    res.json(await getDiagnostics());
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo diagnosticar la impresora' });
  }
});

/** Crea la cola de un equipo USB conectado que aún no tiene una. */
app.post('/api/admin/printers/provision', authenticateToken, async (req, res) => {
  const { serial, queue: requestedName } = req.body || {};
  try {
    if (!serial) return res.status(400).json({ error: 'Falta el número de serie del equipo' });

    const inventory = await getInventory({ force: true });
    // Se busca primero entre las que aún no tienen cola, y si no, entre todo lo
    // conectado: así también sirve para renombrar o recrear la cola de una
    // impresora ya aprovisionada.
    const { listConnectedPrinters } = await import('./utils/printer/identity.js');
    const connected = await listConnectedPrinters();
    const found = connected.find(d => d.serial === serial) || null;

    if (!found) {
      return res.status(404).json({
        error: `No hay ningún equipo conectado con el serial ${serial}.`,
        conectadas: inventory.unprovisionedDevices.map(d => ({ modelo: d.model, serial: d.serial, usb: d.vidPid }))
      });
    }

    const result = await provision(found, { queueName: requestedName });
    if (!result.ok) return res.status(400).json({ error: result.error });

    invalidateInventory();
    res.json({
      ok: true,
      queue: result.queue,
      deviceUri: result.deviceUri || found.cupsUri,
      yaExistia: Boolean(result.alreadyExisted),
      message: `Cola "${result.queue}" lista para ${found.model || found.serial}. Enlázala a un rol desde el panel.`,
      advertencia: 'Una cola creada no garantiza que la impresora esté encendida: se comprueba con la prueba de impresión.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo crear la cola de impresión' });
  }
});

/** Enlaza una impresora lógica (rol) con una cola concreta. */
app.post('/api/admin/printers/bind', authenticateToken, async (req, res) => {
  const { logicalId, queue } = req.body || {};
  if (!logicalId || !queue) {
    return res.status(400).json({ error: 'Indica la impresora lógica y la cola' });
  }
  try {
    const result = await bindQueueToLogical(logicalId, queue);
    if (!result.ok) return res.status(400).json({ error: result.error });
    invalidateInventory();

    res.json({
      ok: true,
      ...result,
      message: result.connected
        ? `Enlazada. Las comandas de "${logicalId}" irán a ${queue}.`
        : `Enlazada, pero ${queue} no tiene equipo conectado: ${result.warning}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo enlazar la impresora' });
  }
});

/** Quita el enlace: el rol vuelve a autodetección. */
app.post('/api/admin/printers/unbind', authenticateToken, async (req, res) => {
  const { logicalId } = req.body || {};
  if (!logicalId) return res.status(400).json({ error: 'Falta la impresora lógica' });
  try {
    const result = await unbindLogical(logicalId);
    invalidateInventory();
    res.json({ ok: true, ...result, message: `Enlace quitado. "${logicalId}" vuelve a autodetección.` });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo quitar el enlace' });
  }
});

/** Enciende o apaga una impresora lógica sin borrarla. */
app.post('/api/admin/printers/toggle', authenticateToken, async (req, res) => {
  const { logicalId, enabled } = req.body || {};
  if (!logicalId || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Indica la impresora lógica y el estado' });
  }
  try {
    const logical = await readLogicalPrinters();
    if (!logical.some(p => p.id === logicalId)) {
      return res.status(404).json({ error: `No existe la impresora lógica "${logicalId}"` });
    }
    const next = logical.map(p => (p.id === logicalId ? { ...p, enabled } : p));
    await writeLogicalPrinters(next);
    invalidateInventory();
    res.json({ ok: true, message: `"${logicalId}" ${enabled ? 'activada' : 'desactivada'}.` });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo cambiar el estado' });
  }
});

/** Historial de trabajos: aquí se ve si las cosas SALIERON de verdad. */
app.get('/api/admin/printers/jobs', authenticateToken, (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    res.json({ jobs: listJobs({ limit }), resumen: jobSummary() });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo leer el historial' });
  }
});

/** Estado de un trabajo concreto. El panel lo consulta para no mentir. */
app.get('/api/admin/printers/jobs/:id', authenticateToken, (req, res) => {
  const job = listJobs({ limit: 200 }).find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Ese trabajo no está en el historial de esta sesión' });
  res.json({ job });
});

/** Cancela los trabajos atascados de una cola, o de todas. */
app.post('/api/admin/printers/clear-stuck', authenticateToken, async (req, res) => {
  const { queue } = req.body || {};
  try {
    const result = await clearStuckJobs(queue || null);
    invalidateInventory();
    if (!result.ok && result.failed?.length) {
      return res.status(500).json({ error: 'No se pudieron limpiar todas las colas', ...result });
    }
    res.json({
      ok: true,
      ...result,
      message: result.cleared.length
        ? `Colas limpiadas: ${result.cleared.join(', ')}`
        : (result.message || 'No había trabajos atascados')
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo limpiar la cola' });
  }
});

/**
 * Prueba de impresión. Aquí SÍ se espera el resultado: el usuario quiere saber
 * si salió papel, no solo si el trabajo entró en la cola.
 */
/**
 * Prueba de impresion. Es la unica operacion que SI espera el resultado real:
 * quien la lanza quiere saber si salio papel, no solo si el trabajo entro en la
 * cola. Por eso distingue "impreso" de "enviado" en cada respuesta.
 */
const runPrintTest = async ({ queue = null, text = null, role = null, viaSocket = false } = {}) => {
  if (viaSocket) {
    const sample = await buildPrintSample();
    const ticket = generarComandaCocina(sample, { restaurantName: process.env.BUSINESS_NAME || 'Gauchos' });

    // El agente si puede confirmar, porque el trabajo ocurre en su equipo.
    const result = await emitRemoteTicket({
      tipo: 'kitchen',
      datosEscPos: ticket,
      role: role || 'kitchen',
      orderId: sample.id,
      wait: true
    });

    return {
      submitted: result.submitted,
      printed: result.printed,
      status: result.status || null,
      jobId: result.jobId || null,
      queue: result.queue || 'agente-local',
      message: result.printed === true
        ? 'Prueba impresa correctamente.'
        : result.printed === null
          ? (result.reason || 'La ticketera no pudo confirmar si salio.')
          : `La prueba NO se imprimio: ${result.reason || 'la ticketera no tiene impresora'}`,
      source: 'socket'
    };
  }

  const result = await printTestText({ queue, text, role: role || 'kitchen' });
  return {
    submitted: result.submitted,
    printed: result.printed,
    status: result.status || null,
    jobId: result.jobId || null,
    queue: result.queue || null,
    message: !result.submitted
      ? (result.reason || 'No se pudo enviar la prueba')
      : result.printed === true
        ? `Prueba impresa correctamente en ${result.queue}.`
        : result.printed === null
          ? `Enviada a ${result.queue}, pero este sistema no puede confirmar si salio.`
          : `Enviada a ${result.queue} pero NO se imprimio: ${result.reason || 'el trabajo no salio de la cola'}`,
    source: result.source || null
  };
};

app.post('/api/admin/printers/test', authenticateToken, async (req, res) => {
  const { queue, text, role } = req.body || {};
  try {
    const result = await runPrintTest({ queue, text, role, viaSocket: shouldUseSocketPrint(req) });

    // 503 cuando no se pudo ni enviar: no hay a quien printing.
    if (!result.submitted) return res.status(503).json({ error: result.message, ...result });

    res.json({ success: true, ...result, printer: result.queue, printerSource: result.source });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo enviar la prueba de impresion' });
  }
});

/**
 * Endpoint antiguo /api/admin/printer/config. Se conserva y ahora enlaza con el
 * rol indicado, que es lo mismo que hacía antes pero sobre la cola indicada.
 */
app.post('/api/admin/printer/config', authenticateToken, async (req, res) => {
  const { queue, logicalId = 'kitchen' } = req.body || {};
  try {
    if (!queue) {
      await unbindLogical(logicalId);
      invalidateInventory();
      return res.json({ ok: true, message: `Enlace de "${logicalId}" eliminado: se usará la detección automática` });
    }
    const result = await bindQueueToLogical(logicalId, queue);
    if (!result.ok) return res.status(400).json({ error: result.error });
    invalidateInventory();
    res.json({ ok: true, ...result, message: `Impresora fijada en "${result.queue}" para "${logicalId}"` });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo guardar la configuración' });
  }
});

// Endpoint antiguo: misma prueba, otro nombre de ruta. Se conserva porque ya
// hay instalaciones que lo usan, y ahora comparte la lógica con el nuevo para
// que las dos rutas no puedan dar respuestas distintas.
app.post('/api/admin/printer/test', authenticateToken, async (req, res) => {
  try {
    const result = await runPrintTest({ ...(req.body || {}), viaSocket: shouldUseSocketPrint(req) });
    if (!result.submitted) return res.status(503).json({ error: result.message, ...result });
    res.json({ success: true, ...result, printer: result.queue, printerSource: result.source });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo enviar la prueba de impresion' });
  }
});

app.patch('/api/admin/pos/orders/:id', authenticateToken, (req, res) => {
  const orderId = Number(req.params.id);
  const current = getPosOrder(orderId);
  if (!current) return res.status(404).json({ error: 'Cuenta no encontrada' });
  if (current.status === 'paid' || current.status === 'cancelled') return res.status(400).json({ error: 'La cuenta ya está cerrada' });
  const items = Array.isArray(req.body.items) ? req.body.items : current.items;
  const cleanItems = items.map(item => ({
    productId: String(item.productId || item.product_id || ''),
    quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    description: String(item.description || '').trim(),
    note: String(item.note || '').trim()
  })).filter(item => item.productId);

  try {
    const products = cleanItems.length ? db.prepare(`SELECT id, name, price FROM products WHERE id IN (${cleanItems.map(() => '?').join(',')}) AND available = 1`).all(...cleanItems.map(item => item.productId)) : [];
    const productMap = new Map(products.map(product => [product.id, product]));
    const resolvedItems = cleanItems.map(item => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Producto no disponible: ${item.productId}`);
      return { ...item, name: product.name, unitPrice: Number(product.price) };
    });
    const subtotal = resolvedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const nextStatus = req.body.status === 'sent' ? 'sent' : req.body.status === 'paid' ? 'paid' : (resolvedItems.length === 0 ? 'cancelled' : 'open');
    const transaction = db.transaction(() => {
      db.prepare(`DELETE FROM pos_order_items WHERE order_id = ?`).run(orderId);
      const insertItem = db.prepare(`INSERT INTO pos_order_items (order_id, product_id, name, unit_price, quantity, description, note) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      resolvedItems.forEach(item => insertItem.run(orderId, item.productId, item.name, item.unitPrice, item.quantity, item.description, item.note));
      db.prepare(`UPDATE pos_orders SET status = ?, notes = ?, subtotal = ?, total = ?, payment_method = ?, updated_at = CURRENT_TIMESTAMP, closed_at = CASE WHEN ? IN ('paid', 'cancelled') THEN CURRENT_TIMESTAMP ELSE closed_at END WHERE id = ?`).run(nextStatus, String(req.body.notes || '').trim(), subtotal, subtotal, String(req.body.paymentMethod || ''), nextStatus, orderId);
      if (nextStatus === 'paid') {
        const today = db.prepare(`SELECT date('now', 'localtime') AS sale_date`).get().sale_date;
        db.prepare(`INSERT INTO daily_sales (sale_date, total, orders, tables_served, average_ticket, updated_at) VALUES (?, ?, 1, 1, ?, CURRENT_TIMESTAMP) ON CONFLICT(sale_date) DO UPDATE SET total = daily_sales.total + excluded.total, orders = daily_sales.orders + 1, tables_served = daily_sales.tables_served + 1, average_ticket = (daily_sales.total + excluded.total) / (daily_sales.orders + 1), updated_at = CURRENT_TIMESTAMP`).run(today, subtotal, subtotal);
      }
    });
    transaction();
    const updatedOrder = getPosOrder(orderId);
    if (updatedOrder && updatedOrder.status === 'cancelled') {
      updatedOrder.items = [];
      updatedOrder.subtotal = 0;
      updatedOrder.total = 0;
      updatedOrder.notes = '';
    }
    res.json(updatedOrder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/users', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`SELECT id, username, role, active, created_at FROM users ORDER BY username ASC`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', authenticateToken, (req, res) => {
  const { id, username, password, role, active } = req.body;
  const cleanUsername = username?.trim();
  if (!cleanUsername) return res.status(400).json({ error: 'El usuario es obligatorio' });
  if (!id && (!password || password.length < 6)) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    const existing = id ? db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) : null;
    if (id && !existing) return res.status(404).json({ error: 'Administrador no encontrado' });
    if (id === req.user.id && active === false) return res.status(400).json({ error: 'No puedes desactivar tu propio usuario' });

    if (existing) {
      const nextPassword = password ? bcrypt.hashSync(password, 10) : existing.password;
      db.prepare(`UPDATE users SET username = ?, password = ?, role = ?, active = ? WHERE id = ?`)
        .run(cleanUsername, nextPassword, role || 'admin', active === false ? 0 : 1, id);
    } else {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(`INSERT INTO users (username, password, role, active) VALUES (?, ?, ?, ?)`)
        .run(cleanUsername, hash, role || 'admin', active === false ? 0 : 1);
    }
    res.json({ message: 'Administrador guardado con éxito' });
  } catch (err) {
    const message = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Ese usuario ya existe' : err.message;
    res.status(400).json({ error: message });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  try {
    const result = db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Administrador no encontrado' });
    res.json({ message: 'Administrador eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/categories', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/categories', authenticateToken, (req, res) => {
  const { id, name, isCustomizable, isCustomPizza, isCustomIceCream, baseName, sort_order } = req.body;
  const catId = id || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  try {
    const stmt = db.prepare(`
      INSERT INTO categories (id, name, isCustomizable, isCustomPizza, isCustomIceCream, baseName, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, isCustomizable=excluded.isCustomizable, isCustomPizza=excluded.isCustomPizza, 
      isCustomIceCream=excluded.isCustomIceCream, baseName=excluded.baseName, sort_order=excluded.sort_order
    `);
    stmt.run(catId, name, isCustomizable ? 1 : 0, isCustomPizza ? 1 : 0, isCustomIceCream ? 1 : 0, baseName || null, sort_order || 99);
    res.json({ message: 'Categoría guardada con éxito', id: catId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/products', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/extras', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM extras ORDER BY type ASC, name ASC`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/extras', authenticateToken, (req, res) => {
  const { id, type, name, price, available, included } = req.body;
  const extraId = id || `${type}_${Date.now()}`;
  const validTypes = ['burger', 'pizza', 'icecream_topping', 'icecream_flavor'];
  if (!validTypes.includes(type) || !name?.trim()) {
    return res.status(400).json({ error: 'Tipo y nombre de extra son obligatorios' });
  }

  try {
    const isIncluded = type === 'icecream_flavor' || Boolean(included);
    const finalPrice = isIncluded ? 0 : (parseFloat(price) || 0);
    const stmt = db.prepare(`
      INSERT INTO extras (id, type, name, price, available, included)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
      type=excluded.type, name=excluded.name, price=excluded.price, available=excluded.available, included=excluded.included
    `);
    stmt.run(extraId, type, name.trim(), finalPrice, available ? 1 : 0, isIncluded ? 1 : 0);
    res.json({ message: 'Extra guardado con éxito', id: extraId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/extras/:id/toggle', authenticateToken, (req, res) => {
  try {
    db.prepare(`UPDATE extras SET available = ? WHERE id = ?`).run(req.body.available ? 1 : 0, req.params.id);
    res.json({ message: 'Disponibilidad del extra actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/products', authenticateToken, (req, res) => {
  const { id, category_id, name, price, description, available, customization_type, promo_free_extras } = req.body;
  const prodId = id || `prod_${Date.now()}`;

  try {
    const stmt = db.prepare(`
      INSERT INTO products (id, category_id, name, price, description, available, customization_type, promo_free_extras) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
      category_id=excluded.category_id, name=excluded.name, price=excluded.price, description=excluded.description,
      available=excluded.available, customization_type=excluded.customization_type, promo_free_extras=excluded.promo_free_extras
    `);
    stmt.run(prodId, category_id, name, parseFloat(price), description || null, available ? 1 : 0, customization_type || 'simple', promo_free_extras ? 1 : 0);
    res.json({ message: 'Producto guardado con éxito', id: prodId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/products/:id/toggle', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { available } = req.body;

  try {
    db.prepare(`UPDATE products SET available = ? WHERE id = ?`).run(available ? 1 : 0, id);
    res.json({ message: 'Estado actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/products/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${process.env.PORT || 3000}`);
  console.log('🔌 Socket.IO habilitado para impresiones remotas.');
});