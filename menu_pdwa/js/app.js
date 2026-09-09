import { MENU_DATA } from './data/menu.js';
import { cart } from './state/cart.js';

document.addEventListener('DOMContentLoaded', () => {
  renderCategories();
  renderProducts(MENU_DATA[0].id);
});

function renderCategories() {
  const nav = document.getElementById('category-nav');
  nav.innerHTML = MENU_DATA.map((cat, index) => `
    <button class="category-btn ${index === 0 ? 'active' : ''}" data-id="${cat.id}">
      ${cat.name}
    </button>
  `).join('');

  nav.addEventListener('click', (e) => {
    if (e.target.classList.contains('category-btn')) {
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderProducts(e.target.dataset.id);
    }
  });
}

function renderProducts(categoryId) {
  const container = document.getElementById('product-list');
  const category = MENU_DATA.find(c => c.id === categoryId);

  if (category.isCustomPizza) {
    container.innerHTML = `
      <div class="product-card">
        <div>
          <h3>Pizza Base Margarita</h3>
          <p>Personaliza tu tamaño y adicionales</p>
        </div>
        <button class="add-btn" id="config-pizza-btn">Configurar</button>
      </div>
    `;
    return;
  }

  container.innerHTML = category.products.map(p => `
    <div class="product-card">
      <div>
        <h3>${p.name}</h3>
        <p>$${p.price.toFixed(2)}</p>
      </div>
      <button class="add-btn" data-id="${p.id}" data-cat="${categoryId}">+ Agregar</button>
    </div>
  `).join('');

  container.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pId = e.target.dataset.id;
      const product = category.products.find(p => p.id === pId);
      cart.addItem({ ...product });
    });
  });
}