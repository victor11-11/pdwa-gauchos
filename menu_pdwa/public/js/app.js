import { BASE_TOPPINGS, BASE_SAUCES, BURGER_EXTRAS } from './data/menu.js';
import { cartState } from './state/cart.js';

// Configura el número de teléfono del restaurante para WhatsApp (Formato internacional sin +)
const RESTAURANT_WHATSAPP = '584120000000'; 

let MENU_DATA = [];
let currentCategory = 'hamburguesas';
let selectedProduct = null;
let selectedPizzaCategory = null;

// Cargar datos desde la API del servidor
async function initApp() {
  try {
    const res = await fetch('/api/menu', { cache: 'no-store' });
    const data = await res.json();
    
    MENU_DATA = data.menu; 

    if (MENU_DATA.length > 0) {
      currentCategory = MENU_DATA[0].id;
    }

    renderCategories();
    renderProducts(currentCategory);
    setupGlobalEventListeners();
    updateCartBar();
  } catch (err) {
    console.error('Error al cargar el menú desde la API:', err);
  }
}

// 1. RENDERIZAR CATEGORÍAS
function renderCategories() {
  const nav = document.getElementById('category-nav');
  if (!nav) return;

  nav.innerHTML = MENU_DATA.map(cat => `
    <button 
      data-category-id="${cat.id}" 
      class="category-btn" 
      style="padding: 8px 16px; border-radius: 20px; border: 1px solid #ddd; cursor: pointer; white-space: nowrap; font-weight: bold; background: ${cat.id === currentCategory ? '#e53e3e' : '#fff'}; color: ${cat.id === currentCategory ? '#fff' : '#333'}; margin-right: 6px;"
    >
      ${cat.name}
    </button>
  `).join('');
}

// 2. RENDERIZAR PRODUCTOS
function renderProducts(categoryId) {
  const container = document.getElementById('product-list');
  if (!container) return;

  const category = MENU_DATA.find(c => c.id === categoryId);
  if (!category) return;

  container.innerHTML = '';

  // CASO A: Pizzas Personalizables
  if (category.isCustomPizza) {
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff; padding:16px; border-radius:8px; border:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;';
    card.innerHTML = `
      <div>
        <h3 style="margin:0 0 4px 0; font-size:18px; color:#333;">Pizza ${category.baseName}</h3>
        <p style="margin:0 0 8px 0; font-size:14px; color:#666;">Selecciona el tamaño e ingredientes adicionales.</p>
        <strong style="color:#e53e3e;">Desde $${category.sizes[0].price.toFixed(2)}</strong>
      </div>
      <button id="btn-open-pizza-custom" style="background:#e53e3e; color:#fff; border:none; padding:10px 16px; border-radius:6px; cursor:pointer; font-weight:bold;">
        Personalizar
      </button>
    `;
    container.appendChild(card);
    return;
  }

  // CASO B: Productos Personalizables vs Directos
  const products = category.products || [];
  container.innerHTML = products.map(prod => `
    <div style="background:#fff; padding:16px; border-radius:8px; border:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div>
        <h3 style="margin:0 0 4px 0; font-size:18px; color:#333;">${prod.name}</h3>
        <strong style="color:#e53e3e;">$${prod.price.toFixed(2)}</strong>
      </div>
      ${category.isCustomizable 
        ? `<button data-prod-id="${prod.id}" class="btn-open-item-custom" style="background:#e53e3e; color:#fff; border:none; padding:10px 16px; border-radius:6px; cursor:pointer; font-weight:bold;">Personalizar</button>`
        : `<button data-prod-id="${prod.id}" class="btn-add-direct" style="background:#222; color:#fff; border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-weight:bold;">+ Agregar</button>`
      }
    </div>
  `).join('');
}

// 3. MODAL DE HAMBURGUESAS Y GRANJEROS
function openItemModal(product) {
  selectedProduct = product;
  const modal = document.getElementById('pizza-modal');
  if (!modal) return;

  const titleEl = document.getElementById('modal-title');
  const descEl = document.getElementById('modal-desc');
  if (titleEl) titleEl.textContent = product.name;
  if (descEl) descEl.textContent = 'Selecciona lo que incluye tu pedido y los extras opcionales.';

  const sizesContainer = document.getElementById('modal-sizes');
  if (sizesContainer) {
    sizesContainer.innerHTML = `
      <strong style="display:block; margin-bottom:8px; color:#333;">Incluidos (desmarca los que no quieras):</strong>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 4px;">
        ${BASE_TOPPINGS.map(top => `
          <label style="font-size:14px; cursor:pointer;">
            <input type="checkbox" name="base-topping" value="${top.id}" data-name="${top.name}" checked>
            ${top.name}
          </label>
        `).join('')}
      </div>
      <strong style="display:block; margin:12px 0 8px 0; color:#333;">Salsas:</strong>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 4px;">
        ${BASE_SAUCES.map(sauce => `
          <label style="font-size:14px; cursor:pointer;">
            <input type="checkbox" name="base-sauce" value="${sauce.id}" data-name="${sauce.name}" checked>
            ${sauce.name}
          </label>
        `).join('')}
      </div>
    `;
  }

  const toppingsContainer = document.getElementById('modal-toppings');
  if (toppingsContainer) {
    toppingsContainer.innerHTML = `
      <strong style="display:block; margin:12px 0 8px 0; color:#333;">Adicionales Con Costo Extra:</strong>
      ${BURGER_EXTRAS.map(extra => `
        <label style="display:block; margin:6px 0; cursor:pointer; font-size:14px;">
          <input type="checkbox" name="burger-extra" value="${extra.id}" data-price="${extra.price}" data-name="${extra.name}">
          ${extra.name} (+$${extra.price.toFixed(2)})
        </label>
      `).join('')}
    `;
  }

  updateItemPrice();
  modal.classList.remove('hidden');
}

function updateItemPrice() {
  if (!selectedProduct) return;
  let total = selectedProduct.price;

  document.querySelectorAll('input[name="burger-extra"]:checked').forEach(extra => {
    total += parseFloat(extra.dataset.price);
  });

  const totalElement = document.getElementById('modal-total');
  if (totalElement) {
    totalElement.textContent = `$${total.toFixed(2)}`;
  }
}

// 4. MODAL DE PIZZAS
function openPizzaModal(pizzaCategory) {
  selectedPizzaCategory = pizzaCategory;
  selectedProduct = null;
  const modal = document.getElementById('pizza-modal');
  if (!modal) return;

  const titleEl = document.getElementById('modal-title');
  const descEl = document.getElementById('modal-desc');
  if (titleEl) titleEl.textContent = `Pizza ${pizzaCategory.baseName}`;
  if (descEl) descEl.textContent = 'Arma tu pizza a la medida';

  const sizesContainer = document.getElementById('modal-sizes');
  if (sizesContainer && pizzaCategory.sizes) {
    sizesContainer.innerHTML = pizzaCategory.sizes.map((size, index) => `
      <label style="display:block; margin:6px 0; cursor:pointer;">
        <input type="radio" name="pizza-size" value="${size.id}" ${index === 0 ? 'checked' : ''} data-price="${size.price}" data-name="${size.name}">
        ${size.name} - $${size.price.toFixed(2)}
      </label>
    `).join('');
  }

  const toppingsContainer = document.getElementById('modal-toppings');
  if (toppingsContainer && pizzaCategory.extras) {
    toppingsContainer.innerHTML = pizzaCategory.extras.map(extra => `
      <label style="display:block; margin:6px 0; cursor:pointer;">
        <input type="checkbox" name="pizza-extra" value="${extra.id}" data-price="${extra.price}" data-name="${extra.name}">
        ${extra.name} (+$${extra.price.toFixed(2)})
      </label>
    `).join('');
  }

  updatePizzaPrice();
  modal.classList.remove('hidden');
}

function updatePizzaPrice() {
  const selectedSizeInput = document.querySelector('input[name="pizza-size"]:checked');
  let total = selectedSizeInput ? parseFloat(selectedSizeInput.dataset.price) : 0;

  document.querySelectorAll('input[name="pizza-extra"]:checked').forEach(extra => {
    total += parseFloat(extra.dataset.price);
  });

  const totalElement = document.getElementById('modal-total');
  if (totalElement) totalElement.textContent = `$${total.toFixed(2)}`;
}

function closeModal() {
  const modal = document.getElementById('pizza-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  selectedPizzaCategory = null;
  selectedProduct = null;
}

// 5. BOTÓN FAB DEL CARRITO Y COMANDA POS LATERAL
function updateCartBar() {
  const cartFab = document.getElementById('cart-fab');
  const cartBadge = document.getElementById('cart-badge');

  if (!cartFab) return;

  const items = cartState.getItems();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  if (count > 0) {
    cartFab.classList.remove('hidden');
    if (cartBadge) cartBadge.textContent = count;
  } else {
    cartFab.classList.add('hidden');
    closeCartModal();
  }
}

function openCartModal() {
  const modal = document.getElementById('cart-modal');
  const container = document.getElementById('cart-items-container');
  const totalEl = document.getElementById('cart-modal-total');
  const itemsCountEl = document.getElementById('pos-items-count');

  const items = cartState.getItems();
  if (items.length === 0) return;

  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  if (itemsCountEl) {
    itemsCountEl.textContent = `${count} producto${count > 1 ? 's' : ''} seleccionado${count > 1 ? 's' : ''}`;
  }

  if (container) {
    container.innerHTML = items.map(item => {
      let customText = '';
      if (item.customizations) {
        if (item.customizations.removed?.length) {
          customText += `<div style="font-size:0.75rem; color:#dc2626; margin-top:2px;">❌ Sin: ${item.customizations.removed.join(', ')}</div>`;
        }
        if (item.customizations.extras?.length) {
          customText += `<div style="font-size:0.75rem; color:#16a34a; margin-top:2px;">➕ Extra: ${item.customizations.extras.map(e => e.name).join(', ')}</div>`;
        }
        if (item.customizations.size) {
          customText += `<div style="font-size:0.75rem; color:#4b5563; margin-top:2px;">📐 Tamaño: ${item.customizations.size}</div>`;
        }
      }

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:10px; border-bottom:1px dashed #cbd5e0;">
          <div style="flex:1; padding-right:8px;">
            <strong style="color:#1a202c; font-size:0.9rem;">${item.name}</strong>
            ${customText}
            <div style="font-weight:bold; color:#e53e3e; margin-top:4px; font-size:0.88rem;">$${(item.unitPrice * item.quantity).toFixed(2)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn-cart-qty" data-id="${item.id}" data-action="sub" style="width:26px; height:26px; border:1px solid #cbd5e0; background:#fff; border-radius:4px; font-weight:bold; cursor:pointer;">-</button>
            <span style="font-weight:bold; font-size:0.9rem; min-width:18px; text-align:center;">${item.quantity}</span>
            <button class="btn-cart-qty" data-id="${item.id}" data-action="add" style="width:26px; height:26px; border:1px solid #cbd5e0; background:#fff; border-radius:4px; font-weight:bold; cursor:pointer;">+</button>
          </div>
        </div>
      `;
    }).join('');
  }

  const total = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
  if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;

  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeCartModal() {
  const modal = document.getElementById('cart-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function sendWhatsAppOrder() {
  const items = cartState.getItems();
  if (items.length === 0) return;

  const table = document.getElementById('order-table')?.value.trim() || 'No especificada';
  const orderType = document.getElementById('order-type')?.value || 'Comer Aquí';
  const notes = document.getElementById('order-notes')?.value.trim() || 'Ninguna';

  let message = `*--- NUEVA COMANDA POS ---*\n`;
  message += `📌 *Tipo de Orden:* ${orderType}\n`;
  message += `📍 *Ubicación/Mesa:* ${table}\n\n`;
  message += `*Detalle del Pedido:*\n`;

  items.forEach(item => {
    message += `• ${item.quantity}x ${item.name} - $${(item.unitPrice * item.quantity).toFixed(2)}\n`;
    if (item.customizations) {
      if (item.customizations.removed?.length) message += `   └ ❌ Sin: ${item.customizations.removed.join(', ')}\n`;
      if (item.customizations.extras?.length) message += `   └ ➕ Extras: ${item.customizations.extras.map(e => e.name).join(', ')}\n`;
      if (item.customizations.size) message += `   └ 📐 Tamaño: ${item.customizations.size}\n`;
    }
  });

  const total = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
  message += `\n📝 *Notas:* ${notes}\n`;
  message += `💰 *TOTAL A PAGAR:* $${total.toFixed(2)}`;

  const encodedUrl = `https://wa.me/${RESTAURANT_WHATSAPP}?text=${encodeURIComponent(message)}`;
  window.open(encodedUrl, '_blank');
}

// 6. EVENT DELEGATION
function setupGlobalEventListeners() {
  document.addEventListener('click', (e) => {
    const catBtn = e.target.closest('[data-category-id]');
    if (catBtn) {
      currentCategory = catBtn.dataset.categoryId;
      renderCategories();
      renderProducts(currentCategory);
      return;
    }

    const customItemBtn = e.target.closest('.btn-open-item-custom');
    if (customItemBtn) {
      const prodId = customItemBtn.dataset.prodId;
      const category = MENU_DATA.find(c => c.id === currentCategory);
      const product = category?.products?.find(p => p.id === prodId);
      if (product) openItemModal(product);
      return;
    }

    const addDirectBtn = e.target.closest('.btn-add-direct');
    if (addDirectBtn) {
      const prodId = addDirectBtn.dataset.prodId;
      const category = MENU_DATA.find(c => c.id === currentCategory);
      const product = category?.products?.find(p => p.id === prodId);

      if (product) {
        cartState.addItem({
          id: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: 1
        });
        updateCartBar();
      }
      return;
    }

    if (e.target.closest('#btn-open-pizza-custom')) {
      const category = MENU_DATA.find(c => c.id === currentCategory);
      if (category) openPizzaModal(category);
      return;
    }

    if (e.target.closest('#btn-close-pizza-modal')) {
      closeModal();
      return;
    }

    // --- EVENTOS DEL CARRITO Y FAB ---
    if (e.target.closest('#cart-fab')) {
      openCartModal();
      return;
    }

    if (e.target.closest('#btn-close-cart-modal')) {
      closeCartModal();
      return;
    }

    const qtyBtn = e.target.closest('.btn-cart-qty');
    if (qtyBtn) {
      const id = qtyBtn.dataset.id;
      const action = qtyBtn.dataset.action;
      cartState.updateQuantity(id, action === 'add' ? 1 : -1);
      openCartModal();
      updateCartBar();
      return;
    }

    if (e.target.closest('#btn-send-whatsapp')) {
      sendWhatsAppOrder();
      return;
    }

    if (e.target.closest('#btn-add-pizza-cart')) {
      if (selectedProduct) {
        const removedToppings = [];
        document.querySelectorAll('input[name="base-topping"]:not(:checked)').forEach(el => removedToppings.push(el.dataset.name));
        document.querySelectorAll('input[name="base-sauce"]:not(:checked)').forEach(el => removedToppings.push(el.dataset.name));

        const extras = [];
        let extraCost = 0;
        document.querySelectorAll('input[name="burger-extra"]:checked').forEach(el => {
          const price = parseFloat(el.dataset.price);
          extras.push({ id: el.value, name: el.dataset.name, price });
          extraCost += price;
        });

        cartState.addItem({
          id: `${selectedProduct.id}-${Date.now()}`,
          name: selectedProduct.name,
          unitPrice: selectedProduct.price + extraCost,
          quantity: 1,
          customizations: { removed: removedToppings, extras }
        });

        closeModal();
        updateCartBar();
        return;
      }

      if (selectedPizzaCategory) {
        const sizeInput = document.querySelector('input[name="pizza-size"]:checked');
        const sizeName = sizeInput ? sizeInput.dataset.name : '';
        const sizePrice = sizeInput ? parseFloat(sizeInput.dataset.price) : 0;

        const extras = [];
        document.querySelectorAll('input[name="pizza-extra"]:checked').forEach(ex => {
          extras.push({ id: ex.value, name: ex.dataset.name, price: parseFloat(ex.dataset.price) });
        });

        const unitPrice = sizePrice + extras.reduce((sum, ex) => sum + ex.price, 0);

        cartState.addItem({
          id: `pizza-${sizeInput ? sizeInput.value : 'custom'}-${Date.now()}`,
          name: `Pizza ${selectedPizzaCategory.baseName} (${sizeName})`,
          unitPrice: unitPrice,
          quantity: 1,
          customizations: { size: sizeName, extras }
        });

        closeModal();
        updateCartBar();
        return;
      }
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'burger-extra') {
      updateItemPrice();
    }
    if (e.target.name === 'pizza-size' || e.target.name === 'pizza-extra') {
      updatePizzaPrice();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}