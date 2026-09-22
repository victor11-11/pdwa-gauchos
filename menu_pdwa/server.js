import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendKitchenTicket } from './utils/printer.js';
import { fetchBCVRates, loadRates, setActiveCurrency, startBCVUpdater } from './utils/bcv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'clave_secreta_super_segura_menu_2026';

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

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
    service REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
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
    const rates = await loadRates();
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo cargar la tasa BCV' });
  }
});

app.post('/api/tasas/actualizar', async (req, res) => {
  try {
    const rates = await fetchBCVRates();
    res.json({ ok: true, ...rates, message: 'Tasas BCV actualizadas' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo actualizar la tasa BCV' });
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

app.put('/api/mesas/:id/liberar', authenticateToken, (req, res) => {
  const result = releasePosTableByNumber(req.params.id);
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

function buildPosPrintPayload(order, req, type = 'kitchen') {
  const normalizedType = String(type || 'kitchen').toLowerCase();
  return {
    ...order,
    id: order.id,
    customer_name: req.body.customer_name || `Mesa ${order.table_number}`,
    customer_phone: req.body.customer_phone || '',
    customer_address: req.body.customer_address || '',
    gps_url: req.body.gps_url || '',
    notes: order.notes || req.body.notes || '',
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
    service: Number(order.service || 0),
    tax: Number(order.tax || 0),
    total: Number(order.total || 0),
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
    const payload = buildPosPrintPayload(order, req, printType);
    const result = await sendKitchenTicket(payload, { restaurantName: 'Gauchos', type: printType });

    res.json({
      success: true,
      message: printType === 'cliente' ? 'Cuenta enviada a la impresora térmica.' : 'Comanda enviada a la impresora térmica.',
      printer: result.printer,
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

    const payload = buildPosPrintPayload(order, req, 'cliente');
    const result = await sendKitchenTicket(payload, { restaurantName: 'Gauchos', type: 'cliente' });

    res.json({
      success: true,
      message: 'Cuenta enviada a la impresora térmica.',
      printer: result.printer,
      orderId: order.id,
      printType: 'cliente'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No se pudo imprimir la cuenta' });
  }
});

app.post('/api/admin/printer/test', authenticateToken, async (req, res) => {
  try {
    const sampleOrder = {
      id: 'PRUEBA',
      table_number: 1,
      customer_name: 'Prueba de impresión',
      notes: 'Ticket de verificación del sistema',
      items: [
        { name: 'Hamburguesa Gaucho', quantity: 1, unit_price: 8.5, description: 'Sin cebolla' },
        { name: 'Refresco 1L', quantity: 2, unit_price: 2.5, description: 'Coca-Cola' }
      ],
      total: 13.5
    };

    const result = await sendKitchenTicket(sampleOrder, { restaurantName: 'Gauchos' });
    res.json({
      success: true,
      message: 'Comanda de prueba enviada correctamente.',
      printer: result.printer
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No se pudo enviar la prueba de impresión' });
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});