import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'clave_secreta_super_segura_menu_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXIÓN A BASE DE DATOS BETTER-SQLITE3
const db = new Database('./database.sqlite');
console.log('⚡ Conectado a la base de datos SQLite.');

// CREACIÓN DE TABLAS
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    isCustomizable INTEGER DEFAULT 0,
    isCustomPizza INTEGER DEFAULT 0,
    baseName TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    available INTEGER DEFAULT 1,
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
    type TEXT CHECK(type IN ('burger', 'pizza')),
    name TEXT NOT NULL,
    price REAL NOT NULL
  );
`);

// USUARIO ADMIN Y SEED
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

  const insertCategory = db.prepare(`INSERT INTO categories VALUES (?,?,?,?,?,?)`);
  const cats = [
    ['hamburguesas', 'Hamburguesas', 1, 0, null, 1],
    ['granjeros', 'Granjeros', 1, 0, null, 2],
    ['entradas', 'Entradas / Para Compartir', 0, 0, null, 3],
    ['ensaladas', 'Ensaladas', 0, 0, null, 4],
    ['pizzas', 'Pizzas', 0, 1, 'Margarita', 5],
    ['bebidas', 'Bebidas', 0, 0, null, 6]
  ];
  cats.forEach(c => insertCategory.run(c));

  const insertProduct = db.prepare(`INSERT INTO products VALUES (?,?,?,?,?)`);
  const prods = [
    ['h1', 'hamburguesas', 'Res', 6.50, 1],
    ['h2', 'hamburguesas', 'Pollo Crispy', 7.00, 1],
    ['h3', 'hamburguesas', 'Gaucho', 8.00, 1],
    ['h4', 'hamburguesas', 'Gaucho a Caballo', 8.50, 1],
    ['h5', 'hamburguesas', 'Punta', 9.00, 1],
    ['h6', 'hamburguesas', 'Super Crispy', 8.00, 1],
    ['g1', 'granjeros', 'Pollo Crispy', 6.00, 1],
    ['g2', 'granjeros', 'Lomito', 7.50, 1],
    ['g3', 'granjeros', 'Lomito con Champiñones', 8.00, 1],
    ['g4', 'granjeros', 'Atún', 6.00, 1],
    ['g5', 'granjeros', 'Pollo Teriyaki', 7.00, 1],
    ['g6', 'granjeros', 'Pollo a la Plancha', 6.50, 1],
    ['e1', 'entradas', 'Nachos', 5.50, 1],
    ['e2', 'entradas', 'Papas con Chili', 6.00, 1],
    ['e3', 'entradas', 'Carpaccio de Lomito', 9.00, 1],
    ['e4', 'entradas', 'Tequeños', 5.00, 1],
    ['e5', 'entradas', 'Ración de Papas Fritas', 3.50, 1],
    ['e6', 'entradas', 'Tenders de Pollo', 6.50, 1],
    ['ens1', 'ensaladas', 'César', 6.00, 1],
    ['ens2', 'ensaladas', 'D\'Roma', 7.00, 1],
    ['b1', 'bebidas', 'Refresco de Lata', 1.50, 1],
    ['b2', 'bebidas', 'Refresco Botella 300ml', 1.25, 1],
    ['b3', 'bebidas', 'Refresco 1L', 2.50, 1],
    ['b4', 'bebidas', 'Refresco 1.5L', 3.00, 1],
    ['b5', 'bebidas', 'Cervezas', 2.00, 1],
    ['b6', 'bebidas', 'Jugos Naturales', 2.00, 1],
    ['b7', 'bebidas', 'Agua Mineral', 1.00, 1]
  ];
  prods.forEach(p => insertProduct.run(p));

  const insertSize = db.prepare(`INSERT INTO pizza_sizes VALUES (?,?,?,?)`);
  insertSize.run(['mediana', 'pizzas', 'Mediana', 8.00]);
  insertSize.run(['grande', 'pizzas', 'Grande', 12.00]);

  const insertExtra = db.prepare(`INSERT INTO extras VALUES (?,?,?,?)`);
  const extrasList = [
    ['tocineta', 'burger', 'Tocineta', 1.50],
    ['queso', 'burger', 'Queso Extra', 1.00],
    ['huevo', 'burger', 'Huevo', 1.00],
    ['jamon', 'pizza', 'Jamón', 1.50],
    ['maiz', 'pizza', 'Maíz', 1.00],
    ['tocino', 'pizza', 'Tocino', 2.00],
    ['extra_queso', 'pizza', 'Extra Queso', 2.00]
  ];
  extrasList.forEach(ex => insertExtra.run(ex));
}

// MIDDLEWARE DE AUTENTICACIÓN ADMIN
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

// RUTAS PÚBLICAS (CLIENTE)
app.get('/api/menu', (req, res) => {
  try {
    const categories = db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC`).all();
    const products = db.prepare(`SELECT * FROM products WHERE available = 1`).all();
    const sizes = db.prepare(`SELECT * FROM pizza_sizes`).all();
    const extras = db.prepare(`SELECT * FROM extras`).all();

    const fullMenu = categories.map(cat => {
      const categoryData = {
        id: cat.id,
        name: cat.name,
        isCustomizable: Boolean(cat.isCustomizable),
        isCustomPizza: Boolean(cat.isCustomPizza)
      };

      if (cat.isCustomPizza) {
        categoryData.baseName = cat.baseName;
        categoryData.sizes = sizes.filter(s => s.category_id === cat.id);
        categoryData.extras = extras.filter(e => e.type === 'pizza');
      } else {
        categoryData.products = products.filter(p => p.category_id === cat.id);
      }

      return categoryData;
    });

    res.json({
      menu: fullMenu,
      burgerExtras: extras.filter(e => e.type === 'burger')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN ADMIN
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    if (!user) return res.status(400).json({ error: 'Usuario incorrecto' });

    const validPass = bcrypt.compareSync(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RUTAS PRIVADAS (ADMIN)
app.get('/api/admin/products', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM products`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/products', authenticateToken, (req, res) => {
  const { id, category_id, name, price, available } = req.body;
  const prodId = id || `prod_${Date.now()}`;

  try {
    const stmt = db.prepare(`
      INSERT INTO products (id, category_id, name, price, available) 
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
      category_id=excluded.category_id, name=excluded.name, price=excluded.price, available=excluded.available
    `);
    stmt.run(prodId, category_id, name, parseFloat(price), available ? 1 : 0);
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