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

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------------
// RUTAS DE NAVEGACIÓN WEB (VISTAS)
// ------------------------------------------------------------------

// Ruta principal -> Menú Público para Clientes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta de administración -> Acceso Administrador / Panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ------------------------------------------------------------------
// CONEXIÓN A BASE DE DATOS BETTER-SQLITE3
// ------------------------------------------------------------------
const db = new Database('./database.sqlite');
console.log('⚡ Conectado a la base de datos SQLite.');

// CREACIÓN Y ACTUALIZACIÓN DE TABLAS
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
    price REAL DEFAULT 0.00
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

  const insertProduct = db.prepare(`INSERT INTO products (id, category_id, name, price, description, available) VALUES (?,?,?,?,?,?)`);
  const prods = [
    ['promo1', 'promos', 'Combo Pareja (2 Burgers Res + Refresco 1L)', 13.50, 'Incluye 2 hamburguesas de res sencillas y refresco de 1 litro.', 1],
    ['promo2', 'promos', 'Mega Pizza + Tequeños', 15.00, 'Pizza grande de 1 ingrediente + ración de 5 tequeños.', 1],
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
    ['ice1', 'helados', 'Tinita', 2.00, 'Tinita tradicional de 1 bola con sirope.', 1],
    ['ice2', 'helados', 'Barquilla', 2.50, 'Barquilla crocante con 1 bola a elección.', 1],
    ['ice3', 'helados', 'Tina 8 oz', 4.00, 'Tina individual de 8oz (hasta 2 sabores).', 1],
    ['ice4', 'helados', 'Tina 16 oz (Medio Litro)', 7.50, 'Tina familiar de 16oz (hasta 3 sabores).', 1],
    ['ice5', 'helados', 'Tina 32 oz (Un Litro)', 13.00, 'Tina de 1 litro ideal para compartir.', 1],
    ['b1', 'bebidas', 'Refresco de Lata', 1.50, null, 1],
    ['b2', 'bebidas', 'Refresco Botella 300ml', 1.25, null, 1],
    ['b3', 'bebidas', 'Refresco 1L', 2.50, null, 1],
    ['b4', 'bebidas', 'Refresco 1.5L', 3.00, null, 1],
    ['b5', 'bebidas', 'Cervezas', 2.00, null, 1],
    ['b6', 'bebidas', 'Jugos Naturales', 2.00, null, 1],
    ['b7', 'bebidas', 'Agua Mineral', 1.00, null, 1]
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
  extrasList.forEach(ex => insertExtra.run(ex));
}

// MIDDLEWARE AUTENTICACIÓN ADMIN
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
        isCustomPizza: Boolean(cat.isCustomPizza),
        isCustomIceCream: Boolean(cat.isCustomIceCream)
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
      burgerExtras: extras.filter(e => e.type === 'burger'),
      iceCreamFlavors: extras.filter(e => e.type === 'icecream_flavor'),
      iceCreamToppings: extras.filter(e => e.type === 'icecream_topping')
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

// Obtener todas las categorías
app.get('/api/admin/categories', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear o actualizar categorías
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

// Obtener todos los productos (incluyendo no disponibles)
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

// Crear o actualizar un producto
app.post('/api/admin/products', authenticateToken, (req, res) => {
  const { id, category_id, name, price, description, available } = req.body;
  const prodId = id || `prod_${Date.now()}`;

  try {
    const stmt = db.prepare(`
      INSERT INTO products (id, category_id, name, price, description, available) 
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
      category_id=excluded.category_id, name=excluded.name, price=excluded.price, description=excluded.description, available=excluded.available
    `);
    stmt.run(prodId, category_id, name, parseFloat(price), description || null, available ? 1 : 0);
    res.json({ message: 'Producto guardado con éxito', id: prodId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activar / Desactivar producto
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

// Eliminar producto
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