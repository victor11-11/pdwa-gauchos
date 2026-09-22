import { BASE_TOPPINGS, BASE_SAUCES, BURGER_EXTRAS } from './data/menu.js';
import { cartState } from './state/cart.js';

// Configura el número de teléfono del restaurante para WhatsApp (Formato internacional sin +)
const RESTAURANT_WHATSAPP = '584121764277'; 

let MENU_DATA = [];
let AVAILABLE_BURGER_EXTRAS = BURGER_EXTRAS;
let INCLUDED_BURGER_EXTRAS = [];
let PAID_BURGER_EXTRAS = BURGER_EXTRAS;
let ICE_CREAM_FLAVORS = [];
let ICE_CREAM_TOPPINGS = [];
let currentCategory = 'hamburguesas';
let selectedProduct = null;
let selectedPizzaCategory = null;
let selectedIceCreamCategory = null;
let selectedPromo = null;
let selectedQuantity = 1;

// Cargar datos desde la API del servidor
async function initApp() {
  try {
    const res = await fetch('/api/menu', { cache: 'no-store' });
    const data = await res.json();
    
    MENU_DATA = data.menu; 
    AVAILABLE_BURGER_EXTRAS = data.burgerExtras?.length ? data.burgerExtras : BURGER_EXTRAS;
    INCLUDED_BURGER_EXTRAS = AVAILABLE_BURGER_EXTRAS.filter(extra => extra.included);
    PAID_BURGER_EXTRAS = AVAILABLE_BURGER_EXTRAS.filter(extra => !extra.included);
    ICE_CREAM_FLAVORS = data.iceCreamFlavors || [];
    ICE_CREAM_TOPPINGS = data.iceCreamToppings || [];

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

  const icons = { promos: '🏷️', hamburguesas: '🍔', granjeros: '🍗', pizzas: '🍕', helados: '🍦', bebidas: '🥤', entradas: '🍟', ensaladas: '🥗' };
  nav.innerHTML = MENU_DATA.map(cat => `
    <button data-category-id="${cat.id}" class="category-btn ${cat.id === currentCategory ? 'is-active' : ''}" type="button">
      <span>${icons[cat.id] || '🍽️'}</span>${cat.name}
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
  const products = category.products || [];
  const categoryIcons = { promos: '🏷️', hamburguesas: '🍔', granjeros: '🍗', pizzas: '🍕', helados: '🍦', bebidas: '🥤', entradas: '🍟', ensaladas: '🥗' };
  const icon = categoryIcons[category.id] || '🍽️';

  const card = (product, actionClass, actionLabel, actionIcon = '+') => `
    <article class="food-card">
      <div class="food-card-top"><div><span class="food-category">${category.name}</span><h3>${product.name}</h3><p class="food-description">${product.description || 'Preparado al momento con ingredientes seleccionados.'}</p></div><span class="food-badge">${icon}</span></div>
      <div class="food-card-bottom"><strong class="food-price">$${Number(product.price).toFixed(2)}</strong><button class="food-action ${actionClass || 'btn-add-direct'}" data-prod-id="${product.id}" type="button">${actionIcon} ${actionLabel}</button></div>
    </article>
  `;

  if (category.id === 'promos') {
    container.innerHTML = products.length ? products.map(prod => prod.customization_type === 'promo_pizza' ? card(prod, 'customize btn-open-promo-custom', 'Personalizar', '⚙️') : card(prod, '', 'Agregar')).join('') : '<div class="empty-menu">No hay promociones disponibles por ahora.</div>';
    return;
  }

  // CASO A: Pizzas Personalizables
  if (category.isCustomPizza) {
    const pizza = { id: 'custom-pizza', name: `Pizza ${category.baseName}`, description: 'Elige tamaño y agrega tus ingredientes favoritos.', price: category.sizes?.[0]?.price || 0 };
    container.innerHTML = `<article class="food-card"><div class="food-card-top"><div><span class="food-category">${category.name}</span><h3>${pizza.name}</h3><p class="food-description">${pizza.description}</p></div><span class="food-badge">🍕</span></div><div class="food-card-bottom"><strong class="food-price">Desde $${Number(pizza.price).toFixed(2)}</strong><button id="btn-open-pizza-custom" class="food-action customize" type="button">⚙️ Personalizar</button></div></article>`;
    return;
  }

  // CASO B: Módulo de Helados (Sabores y Toppings)
  if (category.isCustomIceCream) {
    container.innerHTML = products.length ? products.map(prod => card(prod, 'customize btn-open-icecream-custom', 'Elegir sabores', '⚙️')).join('') : '<div class="empty-menu">No hay presentaciones de helado disponibles por ahora.</div>';
    return;
  }

  // CASO C: Productos Generales, Hamburguesas y Promociones
  container.innerHTML = products.length ? products.map(prod => (prod.customization_type === 'icecream' || category.isCustomizable) ? card(prod, 'customize btn-open-item-custom', 'Personalizar', '⚙️') : card(prod, '', 'Agregar')).join('') : '<div class="empty-menu">No hay productos disponibles en esta categoría.</div>';
}

// 3. MODAL DE HAMBURGUESAS Y GRANJEROS
function openItemModal(product) {
  selectedProduct = product;
  selectedQuantity = 1;
  const modal = document.getElementById('pizza-modal');
  if (!modal) return;

  const titleEl = document.getElementById('modal-title');
  const descEl = document.getElementById('modal-desc');
  if (titleEl) titleEl.textContent = product.name;
  if (descEl) descEl.textContent = product.description || 'Selecciona lo que incluye tu pedido y los extras opcionales.';

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
        ${INCLUDED_BURGER_EXTRAS.map(extra => `
          <label style="font-size:14px; cursor:pointer;">
            <input type="checkbox" name="base-topping" value="${extra.id}" data-name="${extra.name}" checked>
            ${extra.name}
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
      ${PAID_BURGER_EXTRAS.map(extra => `
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
    totalElement.textContent = `$${(total * selectedQuantity).toFixed(2)}`;
  }
}

// 4. MODAL DE HELADOS (SABORES Y TOPPINGS)
function openIceCreamModal(product, category) {
  selectedProduct = product;
  selectedQuantity = 1;
  selectedIceCreamCategory = category;
  const modal = document.getElementById('pizza-modal');
  if (!modal) return;

  const titleEl = document.getElementById('modal-title');
  const descEl = document.getElementById('modal-desc');
  if (titleEl) titleEl.textContent = `🍦 ${product.name}`;
  if (descEl) descEl.textContent = product.description || 'Selecciona tus sabores y toppings favoritos.';

  const flavors = ICE_CREAM_FLAVORS.length > 0 ? ICE_CREAM_FLAVORS : [
    { id: 'f1', name: 'Mantecado' },
    { id: 'f2', name: 'Chocolate' },
    { id: 'f3', name: 'Fresa' }
  ];

  const toppings = ICE_CREAM_TOPPINGS;

  const sizesContainer = document.getElementById('modal-sizes');
  if (sizesContainer) {
    sizesContainer.innerHTML = `
      <strong style="display:block; margin-bottom:8px; color:#333;">Sabores de Helado:</strong>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        ${flavors.map(flv => `
          <label style="font-size:14px; cursor:pointer;">
            <input type="checkbox" name="icecream-flavor" value="${flv.id}" data-name="${flv.name}">
            ${flv.name}
          </label>
        `).join('')}
      </div>
    `;
  }

  const toppingsContainer = document.getElementById('modal-toppings');
  if (toppingsContainer) {
    toppingsContainer.innerHTML = `
      <strong style="display:block; margin:12px 0 8px 0; color:#333;">Toppings Adicionales:</strong>
      ${toppings.map(top => `
        <label style="display:block; margin:6px 0; cursor:pointer; font-size:14px;">
          <input type="checkbox" name="icecream-topping" value="${top.id}" data-price="${top.price}" data-name="${top.name}">
          ${top.name} (+$${top.price.toFixed(2)})
        </label>
      `).join('')}
    `;
  }

  updateIceCreamPrice();
  modal.classList.remove('hidden');
}

function updateIceCreamPrice() {
  if (!selectedProduct) return;
  let total = selectedProduct.price;

  document.querySelectorAll('input[name="icecream-topping"]:checked').forEach(extra => {
    total += parseFloat(extra.dataset.price);
  });

  const totalElement = document.getElementById('modal-total');
  if (totalElement) totalElement.textContent = `$${(total * selectedQuantity).toFixed(2)}`;
}

// 5. MODAL DE PIZZAS
function openPizzaModal(pizzaCategory) {
  selectedPizzaCategory = pizzaCategory;
  selectedProduct = null;
  selectedQuantity = 1;
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

function openPromoPizzaModal(product) {
  selectedPromo = product;
  selectedQuantity = 1;
  selectedProduct = null;
  selectedPizzaCategory = null;
  selectedIceCreamCategory = null;
  const modal = document.getElementById('pizza-modal');
  const titleEl = document.getElementById('modal-title');
  const descEl = document.getElementById('modal-desc');
  const sizesContainer = document.getElementById('modal-sizes');
  const toppingsContainer = document.getElementById('modal-toppings');
  const pizzaCategory = MENU_DATA.find(category => category.isCustomPizza);
  if (!modal || !pizzaCategory) return;

  if (titleEl) titleEl.textContent = product.name;
  if (descEl) descEl.textContent = 'Elige el tamaño y los adicionales de cada pizza. El primero de cada una está incluido.';
  const sizes = pizzaCategory.sizes || [];
  const extras = pizzaCategory.extras || [];
  if (sizesContainer) {
    sizesContainer.innerHTML = [1, 2].map(number => `
      <div style="border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:8px;"><strong>Pizza ${number}</strong>${sizes.map((size, index) => `<label style="display:block; margin:6px 0; cursor:pointer;"><input type="radio" name="promo-pizza-size-${number}" value="${size.id}" ${index === 0 ? 'checked' : ''} data-price="${size.price}" data-name="${size.name}"> ${size.name} - $${Number(size.price).toFixed(2)}</label>`).join('')}</div>
    `).join('');
  }
  if (toppingsContainer) {
    toppingsContainer.innerHTML = [1, 2].map(number => `
      <div style="border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:8px;"><strong>Adicionales pizza ${number}</strong>${extras.map(extra => `<label style="display:block; margin:6px 0; cursor:pointer;"><input type="checkbox" name="promo-pizza-extra-${number}" value="${extra.id}" data-price="${extra.price}" data-name="${extra.name}"> ${extra.name} <span data-extra-label="${number}-${extra.id}">(Gratis si es el primero; luego +$${Number(extra.price).toFixed(2)})</span></label>`).join('')}</div>
    `).join('');
  }
  updatePromoPizzaPrice();
  modal.classList.remove('hidden');
}

function updatePromoPizzaPrice() {
  if (!selectedPromo) return;
  let total = Number(selectedPromo.price);
  [1, 2].forEach(number => {
    const checked = [...document.querySelectorAll(`input[name="promo-pizza-extra-${number}"]:checked`)];
    checked.forEach((extra, index) => {
      if (index > 0) total += Number(extra.dataset.price);
    });
    document.querySelectorAll(`input[name="promo-pizza-extra-${number}"]`).forEach(extra => {
      const label = document.querySelector(`[data-extra-label="${number}-${extra.value}"]`);
      if (label) label.textContent = checked[0] === extra ? '(Incluido)' : `(+$${Number(extra.dataset.price).toFixed(2)})`;
    });
  });
  const totalElement = document.getElementById('modal-total');
  if (totalElement) totalElement.textContent = `$${(total * selectedQuantity).toFixed(2)}`;
}

function updatePizzaPrice() {
  const selectedSizeInput = document.querySelector('input[name="pizza-size"]:checked');
  let total = selectedSizeInput ? parseFloat(selectedSizeInput.dataset.price) : 0;

  document.querySelectorAll('input[name="pizza-extra"]:checked').forEach(extra => {
    total += parseFloat(extra.dataset.price);
  });

  const totalElement = document.getElementById('modal-total');
  if (totalElement) totalElement.textContent = `$${(total * selectedQuantity).toFixed(2)}`;
}

function updateModalQuantity(delta) {
  selectedQuantity = Math.max(1, selectedQuantity + delta);
  const quantityElement = document.getElementById('modal-qty');
  if (quantityElement) quantityElement.textContent = selectedQuantity;
  if (selectedPromo) updatePromoPizzaPrice();
  else if (selectedPizzaCategory) updatePizzaPrice();
  else if (selectedIceCreamCategory) updateIceCreamPrice();
  else updateItemPrice();
}

function closeModal() {
  const modal = document.getElementById('pizza-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  selectedPizzaCategory = null;
  selectedProduct = null;
  selectedIceCreamCategory = null;
  selectedPromo = null;
  selectedQuantity = 1;
  const quantityElement = document.getElementById('modal-qty');
  if (quantityElement) quantityElement.textContent = '1';
}

// 6. BOTÓN FAB DEL CARRITO Y COMANDA POS LATERAL
function updateCartBar() {
  const cartFab = document.getElementById('cart-fab');
  const cartBadge = document.getElementById('cart-badge');
  const cartPreview = document.getElementById('cart-total-preview');

  if (!cartFab) return;

  const items = cartState.getItems();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (count > 0) {
    cartFab.classList.remove('hidden');
    if (cartBadge) cartBadge.textContent = count;
    if (cartPreview) cartPreview.textContent = `$${total.toFixed(2)}`;
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
        if (item.customizations.flavors?.length) {
          customText += `<div style="font-size:0.75rem; color:#d69e2e; margin-top:2px;">🍦 Sabores: ${item.customizations.flavors.join(', ')}</div>`;
        }
        if (item.customizations.removed?.length) {
          customText += `<div style="font-size:0.75rem; color:#dc2626; margin-top:2px;">❌ Sin: ${item.customizations.removed.join(', ')}</div>`;
        }
        if (item.customizations.extras?.length) {
          customText += `<div style="font-size:0.75rem; color:#16a34a; margin-top:2px;">➕ Extra: ${item.customizations.extras.map(e => e.name).join(', ')}</div>`;
        }
        if (item.customizations.size) {
          customText += `<div style="font-size:0.75rem; color:#4b5563; margin-top:2px;">📐 Tamaño: ${item.customizations.size}</div>`;
        }
        if (item.customizations.pizzas?.length) {
          item.customizations.pizzas.forEach((pizza, index) => {
            const extrasText = pizza.extras?.map(extra => `${extra.name}${extra.price ? ` (+$${extra.price.toFixed(2)})` : ' (incluido)'}`).join(', ') || 'Sin adicionales';
            customText += `<div style="font-size:0.75rem; color:#4b5563; margin-top:2px;">🍕 Pizza ${index + 1}: ${pizza.size}; ${extrasText}</div>`;
          });
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
      if (item.customizations.flavors?.length) message += `   └ 🍦 Sabores: ${item.customizations.flavors.join(', ')}\n`;
      if (item.customizations.removed?.length) message += `   └ ❌ Sin: ${item.customizations.removed.join(', ')}\n`;
      if (item.customizations.extras?.length) message += `   └ ➕ Extras: ${item.customizations.extras.map(e => e.name).join(', ')}\n`;
      if (item.customizations.size) message += `   └ 📐 Tamaño: ${item.customizations.size}\n`;
      if (item.customizations.pizzas?.length) {
        item.customizations.pizzas.forEach((pizza, index) => {
          const extras = pizza.extras?.map(extra => `${extra.name}${extra.price ? ` (+$${extra.price.toFixed(2)})` : ' (incluido)'}`).join(', ') || 'Sin adicionales';
          message += `   └ 🍕 Pizza ${index + 1}: ${pizza.size}; ${extras}\n`;
        });
      }
    }
  });

  const total = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
  message += `\n📝 *Notas:* ${notes}\n`;
  message += `💰 *TOTAL A PAGAR:* $${total.toFixed(2)}`;

  const encodedUrl = `https://wa.me/${RESTAURANT_WHATSAPP}?text=${encodeURIComponent(message)}`;
  window.open(encodedUrl, '_blank');
}

// 7. DELEGACIÓN DE EVENTOS GLOBAL
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

    const iceCreamBtn = e.target.closest('.btn-open-icecream-custom');
    if (iceCreamBtn) {
      const prodId = iceCreamBtn.dataset.prodId;
      const category = MENU_DATA.find(c => c.id === currentCategory);
      const product = category?.products?.find(p => p.id === prodId);
      if (product) openIceCreamModal(product, category);
      return;
    }

    const promoBtn = e.target.closest('.btn-open-promo-custom');
    if (promoBtn) {
      const category = MENU_DATA.find(c => c.id === currentCategory);
      const product = category?.products?.find(p => p.id === promoBtn.dataset.prodId);
      if (product) openPromoPizzaModal(product);
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

    if (e.target.closest('#modal-qty-minus')) {
      updateModalQuantity(-1);
      return;
    }

    if (e.target.closest('#modal-qty-plus')) {
      updateModalQuantity(1);
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

    // --- CONFIRMAR EN EL MODAL ---
    if (e.target.closest('#btn-add-pizza-cart')) {
      // 1. Helados
      if (selectedIceCreamCategory && selectedProduct) {
        const selectedFlavors = [];
        document.querySelectorAll('input[name="icecream-flavor"]:checked').forEach(el => selectedFlavors.push(el.dataset.name));

        const extras = [];
        let extraCost = 0;
        document.querySelectorAll('input[name="icecream-topping"]:checked').forEach(el => {
          const price = parseFloat(el.dataset.price);
          extras.push({ id: el.value, name: el.dataset.name, price });
          extraCost += price;
        });

        cartState.addItem({
          id: `icecream-${selectedProduct.id}-${Date.now()}`,
          name: selectedProduct.name,
          unitPrice: selectedProduct.price + extraCost,
          quantity: selectedQuantity,
          customizations: { flavors: selectedFlavors, extras }
        });

        closeModal();
        updateCartBar();
        return;
      }

      // 2. Hamburguesas / Granjeros
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
          quantity: selectedQuantity,
          customizations: { removed: removedToppings, extras }
        });

        closeModal();
        updateCartBar();
        return;
      }

      // 3. Pizzas
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
          quantity: selectedQuantity,
          customizations: { size: sizeName, extras }
        });

        closeModal();
        updateCartBar();
        return;
      }

      if (selectedPromo) {
        const pizzas = [1, 2].map(number => {
          const sizeInput = document.querySelector(`input[name="promo-pizza-size-${number}"]:checked`);
          const extras = [...document.querySelectorAll(`input[name="promo-pizza-extra-${number}"]:checked`)].map((extra, index) => ({
            id: extra.value,
            name: extra.dataset.name,
            price: index === 0 ? 0 : Number(extra.dataset.price)
          }));
          return { size: sizeInput?.dataset.name || '', extras };
        });
        const extrasCost = pizzas.reduce((sum, pizza) => sum + pizza.extras.reduce((pizzaSum, extra) => pizzaSum + extra.price, 0), 0);
        cartState.addItem({
          id: `promo-${selectedPromo.id}-${Date.now()}`,
          name: selectedPromo.name,
          unitPrice: Number(selectedPromo.price) + extrasCost,
          quantity: selectedQuantity,
          customizations: { pizzas }
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
    if (e.target.name === 'icecream-topping') {
      updateIceCreamPrice();
    }
    if (e.target.name === 'pizza-size' || e.target.name === 'pizza-extra') {
      updatePizzaPrice();
    }
    if (e.target.name?.startsWith('promo-pizza-')) {
      updatePromoPizzaPrice();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}