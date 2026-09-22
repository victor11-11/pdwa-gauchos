const API_URL = '/api';
let token = localStorage.getItem('admin_token');

// Elementos del DOM
const loginSection = document.getElementById('login-section');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const productsList = document.getElementById('products-list');
const logoutBtn = document.getElementById('logout-btn');

// Formulario de Productos / Promos
const productForm = document.getElementById('product-form');
const prodIdInput = document.getElementById('prod-id');
const prodCategorySelect = document.getElementById('prod-category');
const prodNameInput = document.getElementById('prod-name');
const prodPriceInput = document.getElementById('prod-price');
const prodDescInput = document.getElementById('prod-description');
const prodCustomizationSelect = document.getElementById('prod-customization');
const prodFreeExtrasCheck = document.getElementById('prod-free-extras');
const prodAvailableCheck = document.getElementById('prod-available');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Formulario y listado de extras, toppings y sabores
const extraForm = document.getElementById('extra-form');
const extraIdInput = document.getElementById('extra-id');
const extraTypeSelect = document.getElementById('extra-type');
const extraNameInput = document.getElementById('extra-name');
const extraPriceInput = document.getElementById('extra-price');
const extraIncludedCheck = document.getElementById('extra-included');
const extraAvailableCheck = document.getElementById('extra-available');
const extrasList = document.getElementById('extras-list');
const cancelExtraBtn = document.getElementById('cancel-extra-btn');
const extraFilterType = document.getElementById('extra-filter-type');

// Formulario de Categorías
const categoryForm = document.getElementById('category-form');
const catNameInput = document.getElementById('cat-name');
const catCustomCheck = document.getElementById('cat-customizable');
const catIceCreamCheck = document.getElementById('cat-icecream');
const productSearch = document.getElementById('product-search');
const productFilterCategory = document.getElementById('product-filter-category');
const productCount = document.getElementById('product-count');
const adminUserForm = document.getElementById('admin-user-form');
const adminUserId = document.getElementById('admin-user-id');
const adminUsername = document.getElementById('admin-username');
const adminPassword = document.getElementById('admin-password');
const adminRole = document.getElementById('admin-role');
const adminActive = document.getElementById('admin-active');
const adminUsersList = document.getElementById('admin-users-list');
const cancelAdminEdit = document.getElementById('cancel-admin-edit');
const dailySalesTotal = document.getElementById('daily-sales-total');
const dailySalesMeta = document.getElementById('daily-sales-meta');
const occupiedTablesValue = document.getElementById('occupied-tables-value');
const occupiedTablesMeta = document.getElementById('occupied-tables-meta');
const averageTicketValue = document.getElementById('average-ticket-value');
const averageTicketMeta = document.getElementById('average-ticket-meta');
const dailyOrdersList = document.getElementById('daily-orders-list');
const tablesGrid = document.getElementById('tables-grid');
const posTitle = document.getElementById('pos-title');
const posTableBadge = document.getElementById('pos-table-badge');
const posProductSelect = document.getElementById('pos-product-select');
const posAddProduct = document.getElementById('pos-add-product');
const posCategoryNav = document.getElementById('pos-category-nav');
const posProductGrid = document.getElementById('pos-product-grid');
const posCartCount = document.getElementById('pos-cart-count');
const backToTablesButton = document.getElementById('back-to-tables-btn');
const posItems = document.getElementById('pos-items');
const posNotes = document.getElementById('pos-notes');
const posSubtotal = document.getElementById('pos-subtotal');
const posTotal = document.getElementById('pos-total');
const sendCommandButton = document.getElementById('send-command-btn');
const printKitchenButton = document.getElementById('print-kitchen-btn');
const printSaleButton = document.getElementById('print-sale-btn');
let posTables = [];
let posProducts = [];
let posCategories = [];
let activePosCategory = '';
let activePosOrder = null;

// Inicialización
if (token) {
  showPanel();
} else {
  showLogin();
}

function showLogin() {
  loginSection.classList.remove('hidden');
  adminPanel.classList.add('hidden');
}

function showPanel() {
  loginSection.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  loadCategories();
  loadProducts();
  loadExtras();
  loadPosCatalog();
  loadPosTables();
  loadAdminUsers();
  loadDashboard();
}

async function loadDashboard() {
  try {
    const res = await fetch(`${API_URL}/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const summary = await readApiJson(res);
    if (!res.ok) throw new Error(summary.error || 'No se pudo cargar el resumen diario');
    const total = Number(summary.total) || 0;
    const orders = Number(summary.orders) || 0;
    const tables = Number(summary.tables_served) || 0;
    const average = Number(summary.average_ticket) || 0;
    if (dailySalesTotal) dailySalesTotal.textContent = `$${total.toFixed(2)}`;
    if (dailySalesMeta) dailySalesMeta.textContent = `${orders} pedido${orders === 1 ? '' : 's'} · ${tables} mesa${tables === 1 ? '' : 's'} atendida${tables === 1 ? '' : 's'}`;
    if (occupiedTablesValue) occupiedTablesValue.textContent = tables;
    if (occupiedTablesMeta) occupiedTablesMeta.textContent = `${Math.max(24 - tables, 0)} libres · 0 reservas`;
    if (averageTicketValue) averageTicketValue.textContent = `$${average.toFixed(2)}`;
    if (averageTicketMeta) averageTicketMeta.textContent = orders ? 'Promedio de ventas de hoy' : 'Sin ventas registradas hoy';
    if (dailyOrdersList && orders) {
      dailyOrdersList.innerHTML = `<tr><td>Hoy</td><td>${orders} venta${orders === 1 ? '' : 's'} registradas</td><td>Actual</td><td>$${total.toFixed(2)}</td><td><span class="status-pill available">Cerradas</span></td></tr>`;
    }
  } catch (err) {
    console.error('Error al cargar resumen diario:', err);
  }
}

const extraTypeLabels = {
  burger: 'Hamburguesa',
  pizza: 'Pizza',
  icecream_flavor: 'Sabor de helado',
  icecream_topping: 'Topping de helado'
};

document.querySelectorAll('.dashboard-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.dashboard-tab').forEach(item => item.classList.toggle('is-active', item === tab));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.tab));
  });
});

function showNotice(message, type = 'success') {
  let notice = document.getElementById('admin-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'admin-notice';
    notice.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:20;padding:14px 18px;border-radius:12px;background:#1f2937;color:#fff;box-shadow:0 12px 28px rgba(17,24,39,.2);font-weight:700;transition:opacity .2s ease;';
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.style.background = type === 'error' ? '#b4233a' : '#176b46';
  notice.style.opacity = '1';
  clearTimeout(showNotice.timeout);
  showNotice.timeout = setTimeout(() => { notice.style.opacity = '0'; }, 2600);
}

async function loadBcvRates() {
  try {
    const res = await fetch('/api/tasas', { cache: 'no-store' });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || 'No se pudo cargar la tasa BCV');

    const usd = Number(data.tasa_usd || 0);
    const eur = Number(data.tasa_eur || 0);
    const active = String(data.moneda_activa || 'USD').toUpperCase();
    const updated = data.ultima_actualizacion ? new Date(data.ultima_actualizacion).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin actualización';

    window.__bcvRate = active === 'EUR' ? eur : usd;
    if (bcvRateValue) {
      bcvRateValue.textContent = `USD ${usd.toFixed(2)} · EUR ${eur.toFixed(2)}`;
    }
    if (bcvRateMeta) {
      bcvRateMeta.textContent = `Actualizado ${updated} · Activa: ${active}`;
    }
    if (bcvCurrencySelect) {
      bcvCurrencySelect.value = active;
    }
    if (document.getElementById('client-bcv-rate')) {
      const rate = active === 'EUR' ? eur : usd;
      document.getElementById('client-bcv-rate').textContent = `${active}: ${rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;
    }
    const headerBadge = document.getElementById('bcv-header-badge');
    if (headerBadge) {
      const activeRate = active === 'EUR' ? eur : usd;
      headerBadge.textContent = `Tasa BCV: ${activeRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs/$`;
    }
    return data;
  } catch (err) {
    console.error('BCV:', err);
    if (bcvRateMeta) bcvRateMeta.textContent = 'No se pudo cargar la tasa';
    return null;
  }
}

async function refreshBcvRates() {
  try {
    const res = await fetch('/api/tasas/actualizar', { method: 'POST' });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la tasa BCV');
    await loadBcvRates();
    showNotice('Tasa BCV actualizada.', 'success');
    return data;
  } catch (err) {
    showNotice(err.message, 'error');
    return null;
  }
}

async function setGlobalCurrency(currency) {
  try {
    const res = await fetch('/api/tasas/moneda', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moneda: currency })
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la moneda');
    await loadBcvRates();
    return data;
  } catch (err) {
    showNotice(err.message, 'error');
    return null;
  }
}

function activateView(view) {
  document.querySelectorAll('[data-view]:not(.nav-item)').forEach(section => {
    section.classList.toggle('admin-view-hidden', section.dataset.view !== view);
  });
  document.querySelectorAll('.nav-item[data-view]').forEach(navItem => {
    navItem.classList.toggle('active', navItem.dataset.view === view);
  });
  const dashboardGrid = document.querySelector('.dashboard-grid');
  if (dashboardGrid) {
    dashboardGrid.classList.toggle('admin-view-hidden', !['pos', 'reports'].includes(view));
    dashboardGrid.classList.toggle('pos-active', view === 'pos');
  }
}

document.querySelectorAll('.nav-item[data-view]').forEach(item => {
  item.addEventListener('click', () => {
    activateView(item.dataset.view);
  });
});

activateView('dashboard');

async function loadPosCatalog() {
  try {
    const res = await fetch('/api/menu', { cache: 'no-store' });
    const data = await res.json();
    posCategories = (data.menu || []).filter(category => (category.products || []).length).map(category => ({ id: category.id, name: category.name }));
    posProducts = (data.menu || []).flatMap(category => (category.products || []).map(product => ({ ...product, categoryId: category.id, categoryName: category.name })));
    activePosCategory = activePosCategory || posCategories[0]?.id || '';
    renderPosCatalog();
    if (posProductSelect) {
      posProductSelect.innerHTML = '<option value="">Selecciona un producto</option>' + posProducts.map(product => `<option value="${product.id}">${product.name} · $${Number(product.price).toFixed(2)}</option>`).join('');
    }
  } catch (err) {
    showNotice('No se pudo cargar el catálogo del POS.', 'error');
  }
}

function renderPosCatalog() {
  if (!posCategoryNav || !posProductGrid) return;
  posCategoryNav.innerHTML = posCategories.map(category => `<button class="pos-category-button ${category.id === activePosCategory ? 'is-active' : ''}" data-pos-category="${category.id}" type="button" role="tab" aria-selected="${category.id === activePosCategory}">${escapeHtml(category.name)}</button>`).join('');
  const products = posProducts.filter(product => product.categoryId === activePosCategory);
  posProductGrid.innerHTML = products.length ? products.map(product => `<button class="pos-product-card ${activePosOrder ? '' : 'is-disabled'}" data-pos-product-id="${product.id}" type="button" ${activePosOrder ? '' : 'disabled'}><span class="pos-product-visual" aria-hidden="true">${getProductIcon(product.categoryId)}</span><span class="pos-product-info"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.description || product.categoryName)}</small><b>$${Number(product.price).toFixed(2)}</b></span></button>`).join('') : '<p class="pos-empty">No hay productos disponibles en esta categoría.</p>';
}

function getProductIcon(categoryId) {
  return { hamburguesas: '🍔', granjeros: '🍗', entradas: '🍟', ensaladas: '🥗', bebidas: '🥤', promos: '🏷️' }[categoryId] || '🍽️';
}

async function loadPosTables() {
  try {
    const res = await fetch(`${API_URL}/admin/pos/tables`, { headers: { 'Authorization': `Bearer ${token}` } });
    posTables = await readApiJson(res);
    renderPosTables();
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

function renderPosTables() {
  if (!tablesGrid) return;
  tablesGrid.innerHTML = posTables.map(table => {
    const order = table.order;
    const itemCount = Number(order?.item_count || 0);
    const total = Number(order?.total || 0);
    const hasVisibleOrder = Boolean(order && (itemCount > 0 || total > 0));
    const active = table.status !== 'available' && hasVisibleOrder;
    const shouldShowRelease = Boolean(order && (!hasVisibleOrder || active));
    return `<article class="surface-card table-status-card ${active ? 'is-occupied' : ''}">
      <div class="table-status-top"><strong>Mesa ${table.number}</strong><span class="status-pill ${active ? 'unavailable' : 'available'}">${active ? (table.status === 'sent' ? 'Comanda enviada' : 'Ocupada') : 'Libre'}</span></div>
      <p>${active ? `${itemCount || 0} productos · $${total.toFixed(2)}` : (order && !hasVisibleOrder ? 'Cuenta vacía · requiere liberación' : 'Sin cuenta activa')}</p>
      <div class="table-card-actions">
        <button class="outline-button wide table-action" data-table-number="${table.number}" type="button">${active ? 'Ver cuenta' : 'Abrir mesa'}</button>
        ${active && order?.id ? `<button class="outline-button wide print-order" data-print-order="${order.id}" type="button">Imprimir comanda</button>` : ''}
        ${shouldShowRelease ? `<button class="ghost-button wide release-table-btn" data-release-table="${table.number}" type="button">Liberar mesa</button>` : ''}
      </div>
    </article>`;
  }).join('');
}

async function openPosTable(tableNumber) {
  try {
    const res = await fetch(`${API_URL}/admin/pos/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ tableNumber })
    });
    const order = await readApiJson(res);
    if (!res.ok) throw new Error(order.error || 'No se pudo abrir la mesa');
    activePosOrder = order;
    renderPosOrder();
    activateView('pos');
    document.getElementById('pos-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    loadPosTables();
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

function renderPosOrder() {
  const hasOrder = Boolean(activePosOrder);
  const items = activePosOrder?.items || [];
  if (posTitle) posTitle.textContent = hasOrder ? `Cuenta mesa ${activePosOrder.table_number}` : 'Selecciona una mesa';
  if (posTableBadge) posTableBadge.textContent = hasOrder ? `Mesa ${activePosOrder.table_number}` : 'Sin mesa';
  if (posNotes) posNotes.value = activePosOrder?.notes || '';
  if (posProductSelect) posProductSelect.disabled = !hasOrder;
  if (posAddProduct) posAddProduct.disabled = !hasOrder;
  if (posCartCount) {
    const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    posCartCount.textContent = `${itemCount} producto${itemCount === 1 ? '' : 's'}`;
  }
  if (sendCommandButton) sendCommandButton.disabled = !hasOrder || !items.length;
  if (printKitchenButton) printKitchenButton.disabled = !hasOrder || !items.length;
  if (printSaleButton) printSaleButton.disabled = !hasOrder;
  if (chargeSaleButton) chargeSaleButton.disabled = !hasOrder || !items.length;
  const releaseTableButton = document.getElementById('release-table-btn');
  if (releaseTableButton) releaseTableButton.disabled = !hasOrder;
  if (posItems) posItems.innerHTML = hasOrder && items.length ? items.map(item => `<div class="pos-item" data-item-id="${item.id}"><div class="pos-item-copy"><strong>${item.name}</strong><small>${item.quantity}x · $${Number(item.unit_price).toFixed(2)}</small><input class="pos-item-note" data-item-id="${item.id}" value="${escapeHtml(item.note || '')}" placeholder="Nota del ítem (ej. sin cebolla)" /><input class="pos-item-description" data-item-id="${item.id}" value="${escapeHtml(item.description || '')}" placeholder="Descripción para cocina" /></div><div class="pos-item-actions"><span>$${(Number(item.unit_price) * item.quantity).toFixed(2)}</span><div class="pos-qty-control"><button class="pos-quantity-button" data-item-id="${item.id}" data-quantity-change="-1" type="button" aria-label="Disminuir cantidad">−</button><strong>${item.quantity}</strong><button class="pos-quantity-button" data-item-id="${item.id}" data-quantity-change="1" type="button" aria-label="Aumentar cantidad">+</button></div><button class="ghost-button pos-remove-item" data-item-id="${item.id}" type="button" aria-label="Eliminar producto">Eliminar</button></div></div>`).join('') : `<p class="pos-empty">${hasOrder ? 'Agrega productos para abrir la cuenta.' : 'Abre una mesa para comenzar la cuenta.'}</p>`;
  const subtotal = Number(activePosOrder?.subtotal || 0);
  const totalRef = Number(activePosOrder?.total || 0);
  const activeRate = Number((window.__bcvRate || 852.41));
  const totalBs = totalRef * activeRate;
  if (posSubtotal) posSubtotal.textContent = `$${subtotal.toFixed(2)}`;
  if (posTotal) posTotal.textContent = `$${totalRef.toFixed(2)}`;
  const totalBsEl = document.getElementById('pos-total-bs');
  if (totalBsEl) totalBsEl.textContent = `${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`;
  renderPosCatalog();
}

async function savePosOrder(status = 'open', paymentMethod = '') {
  if (!activePosOrder) return null;
  const items = (activePosOrder.items || []).map(item => ({
    productId: item.product_id,
    quantity: item.quantity,
    description: item.description || '',
    note: item.note || ''
  }));
  const res = await fetch(`${API_URL}/admin/pos/orders/${activePosOrder.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ items, notes: posNotes?.value || '', status, paymentMethod })
  });
  const order = await readApiJson(res);
  if (!res.ok) throw new Error(order.error || 'No se pudo actualizar la cuenta');
  activePosOrder = order && (order.status === 'cancelled' || order.status === 'available' || !order.items?.length) ? null : order;
  renderPosOrder();
  await loadPosTables();
  return activePosOrder;
}

async function releaseTableOrder(tableNumber, orderId = null) {
  const targetTable = Number(tableNumber ?? activePosOrder?.table_number ?? 0);
  if (!targetTable && !orderId) return;
  if (!confirm(`¿Liberar la mesa ${targetTable || activePosOrder?.table_number}?`)) return;

  try {
    const endpoint = orderId ? `${API_URL}/pedidos/${orderId}/cerrar` : `${API_URL}/admin/pos/tables/${targetTable}/liberar`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || 'No se pudo liberar la mesa');
    activePosOrder = null;
    renderPosOrder();
    await loadPosTables();
    showNotice(data.message || 'Mesa liberada.');
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

document.addEventListener('click', async event => {
  const categoryButton = event.target.closest('[data-pos-category]');
  if (categoryButton) {
    activePosCategory = categoryButton.dataset.posCategory;
    renderPosCatalog();
    return;
  }
  const productCard = event.target.closest('[data-pos-product-id]');
  if (productCard && activePosOrder) {
    await addProductToOrder(productCard.dataset.posProductId);
    return;
  }
  const tableButton = event.target.closest('.table-action');
  if (tableButton) await openPosTable(Number(tableButton.dataset.tableNumber));

  const releaseTableBtn = event.target.closest('.release-table-btn');
  if (releaseTableBtn) {
    await releaseTableOrder(Number(releaseTableBtn.dataset.releaseTable));
    return;
  }

  const printOrderButton = event.target.closest('.print-order');
  if (printOrderButton) {
    await printKitchenOrder(Number(printOrderButton.dataset.printOrder));
    return;
  }

  const removeButton = event.target.closest('.pos-remove-item');
  if (removeButton && activePosOrder) {
    activePosOrder.items = activePosOrder.items.filter(item => String(item.id) !== removeButton.dataset.itemId);
    await savePosOrder();
  }
  const quantityButton = event.target.closest('.pos-quantity-button');
  if (quantityButton && activePosOrder) {
    const item = activePosOrder.items.find(orderItem => String(orderItem.id) === quantityButton.dataset.itemId);
    if (item) {
      item.quantity += Number(quantityButton.dataset.quantityChange);
      if (item.quantity <= 0) activePosOrder.items = activePosOrder.items.filter(orderItem => orderItem !== item);
      await savePosOrder();
    }
  }
});

async function addProductToOrder(productId) {
  const product = posProducts.find(item => item.id === productId);
  if (!product || !activePosOrder) return;
  const existing = activePosOrder.items.find(item => item.product_id === product.id);
  if (existing) existing.quantity += 1;
else activePosOrder.items.push({ product_id: product.id, name: product.name, unit_price: product.price, quantity: 1, description: '', note: '' });
  try {
    await savePosOrder();
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

async function persistItemField(itemId, fieldName, value) {
  if (!activePosOrder) return;
  const item = activePosOrder.items.find(orderItem => String(orderItem.id) === String(itemId));
  if (!item) return;
  item[fieldName] = String(value || '').trim();
  try {
    await savePosOrder();
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

document.addEventListener('keydown', async event => {
  const descriptionInput = event.target.closest('.pos-item-description');
  if (descriptionInput && event.key === 'Enter') {
    event.preventDefault();
    await persistItemField(descriptionInput.dataset.itemId, 'description', descriptionInput.value);
    descriptionInput.blur();
    return;
  }

  const noteInput = event.target.closest('.pos-item-note');
  if (noteInput && event.key === 'Enter') {
    event.preventDefault();
    await persistItemField(noteInput.dataset.itemId, 'note', noteInput.value);
    noteInput.blur();
  }
});

document.addEventListener('change', async event => {
  const descriptionInput = event.target.closest('.pos-item-description');
  if (descriptionInput && activePosOrder) {
    await persistItemField(descriptionInput.dataset.itemId, 'description', descriptionInput.value);
  }

  const noteInput = event.target.closest('.pos-item-note');
  if (noteInput && activePosOrder) {
    await persistItemField(noteInput.dataset.itemId, 'note', noteInput.value);
  }
});

if (posAddProduct) posAddProduct.addEventListener('click', () => addProductToOrder(posProductSelect.value));

if (backToTablesButton) backToTablesButton.addEventListener('click', () => {
  activePosOrder = null;
  renderPosOrder();
  activateView('tables');
  document.getElementById('tables-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

if (sendCommandButton) sendCommandButton.addEventListener('click', async () => {
  try {
    await savePosOrder('sent');
    showNotice('Comanda enviada a cocina.');
    await loadPosTables();
  } catch (err) { showNotice(err.message, 'error'); }
});

setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadPosTables();
    if (activePosOrder) {
      const orderId = activePosOrder.id;
      fetch(`${API_URL}/admin/pos/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(async (res) => {
        if (!res.ok) return;
        const order = await readApiJson(res);
        activePosOrder = order;
        renderPosOrder();
      }).catch(() => {});
    }
  }
}, 15000);

async function printKitchenOrder(orderId) {
  const order = activePosOrder && activePosOrder.id === orderId ? activePosOrder : null;
  if (!orderId) return;
  try {
    const res = await fetch(`${API_URL}/pedidos/${orderId}/imprimir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        customer_name: order ? `Mesa ${order.table_number}` : '',
        customer_phone: '',
        customer_address: '',
        gps_url: ''
      })
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || 'No se pudo imprimir la comanda');
    showNotice(data.message || 'Comanda enviada a la impresora.');
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

if (printKitchenButton) {
  printKitchenButton.addEventListener('click', async () => {
    const orderId = activePosOrder?.id;
    if (!orderId) return;
    await printKitchenOrder(orderId);
  });
}

if (printSaleButton) {
  printSaleButton.addEventListener('click', async () => {
    const orderId = activePosOrder?.id;
    if (!orderId) return;
    await printPosReceipt(orderId);
  });
}

const globalSearch = document.getElementById('global-search');
if (globalSearch) {
  globalSearch.addEventListener('input', () => {
    const query = globalSearch.value.trim().toLowerCase();
    if (productSearch) {
      productSearch.value = query;
      filterProducts();
    }
    const hasResults = [...document.querySelectorAll('.data-table tbody tr')]
      .some(row => row.textContent.toLowerCase().includes(query));
    if (query && !hasResults) showNotice('No se encontraron coincidencias.', 'error');
  });
}

const currencyToggle = document.getElementById('currency-toggle');
if (currencyToggle) {
  currencyToggle.addEventListener('click', () => {
    const isUsd = currencyToggle.dataset.currency !== 'bs';
    currencyToggle.dataset.currency = isUsd ? 'bs' : 'usd';
    currencyToggle.innerHTML = isUsd
      ? '<span>BS</span><span class="currency-divider">/</span><span class="muted">USD</span>'
      : '<span>USD</span><span class="currency-divider">/</span><span class="muted">BS</span>';
    showNotice(`Moneda principal: ${isUsd ? 'BS' : 'USD'}.`);
  });
}

const newSaleButton = document.getElementById('new-sale-btn');
if (newSaleButton) newSaleButton.addEventListener('click', () => {
  document.getElementById('pos-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showNotice('Nueva venta lista para registrar.');
});

const reportsButton = document.getElementById('reports-btn');
if (reportsButton) reportsButton.addEventListener('click', () => {
  document.getElementById('reports-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showNotice('Mostrando actividad reciente de ventas.');
});

const printerTestButton = document.getElementById('printer-test-btn');
if (printerTestButton) {
  printerTestButton.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_URL}/admin/printer/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la prueba de impresión');
      showNotice(data.message || 'Prueba de impresora enviada.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  });
}

const chargeSaleButton = document.getElementById('charge-sale-btn');
const bcvRateValue = document.getElementById('bcv-rate-value');
const bcvRateMeta = document.getElementById('bcv-rate-meta');
const bcvCurrencySelect = document.getElementById('bcv-currency-select');
const bcvRefreshButton = document.getElementById('bvc-refresh-btn');
window.__bcvRate = 852.41;

if (bcvRefreshButton) {
  bcvRefreshButton.addEventListener('click', refreshBcvRates);
}

if (bcvCurrencySelect) {
  bcvCurrencySelect.addEventListener('change', async (event) => {
    await setGlobalCurrency(event.target.value);
  });
}

loadBcvRates();

if (chargeSaleButton) chargeSaleButton.addEventListener('click', async () => {
  if (!activePosOrder) return;
  if (!confirm(`¿Cerrar y cobrar la cuenta de la mesa ${activePosOrder.table_number} por $${Number(activePosOrder.total).toFixed(2)}?`)) return;
  try {
    const orderId = activePosOrder.id;
    const tableNumber = activePosOrder.table_number;
    const updatedOrder = await savePosOrder('paid', 'efectivo');
    if (updatedOrder) {
      activePosOrder = updatedOrder;
    }
    if (orderId) await printPosReceipt(orderId);
    await releaseTableOrder(tableNumber, orderId);
    loadDashboard();
  } catch (err) {
    showNotice(err.message, 'error');
  }
});

if (document.getElementById('release-table-btn')) {
  document.getElementById('release-table-btn').addEventListener('click', async () => {
    if (!activePosOrder) return;
    await releaseTableOrder(activePosOrder.table_number, activePosOrder.id);
  });
}

async function printPosReceipt(orderId) {
  if (!orderId) return;
  try {
    const res = await fetch(`${API_URL}/pedidos/${orderId}/imprimir-cuenta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        customer_name: '',
        customer_phone: '',
        customer_address: '',
        gps_url: ''
      })
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || 'No se pudo imprimir la cuenta');
    showNotice(data.message || 'Cuenta enviada a la impresora.');
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

// Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch(`${API_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');

    token = data.token;
    localStorage.setItem('admin_token', token);
    loginError.classList.add('hidden');
    showPanel();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  token = null;
  showLogin();
});

// Cargar categorías en el <select>
async function loadCategories() {
  try {
    const res = await fetch(`${API_URL}/admin/categories`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;

    const categories = await res.json();
    if (prodCategorySelect) {
      prodCategorySelect.innerHTML = categories.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
    }
    if (productFilterCategory) {
      const selectedCategory = productFilterCategory.value;
      productFilterCategory.innerHTML = '<option value="all">Todas</option>' + categories.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
      productFilterCategory.value = categories.some(c => c.id === selectedCategory) ? selectedCategory : 'all';
    }
  } catch (err) {
    console.error('Error al cargar categorías:', err);
  }
}

// Cargar lista de productos
async function loadProducts() {
  try {
    const res = await fetch(`${API_URL}/admin/products`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('admin_token');
      token = null;
      showLogin();
      return;
    }

    const products = await res.json();
    productsList.innerHTML = products.map(p => `
      <tr data-category-id="${p.category_id}">
        <td><strong>${p.name}</strong>${p.description ? `<br><small style="color:#666;">${p.description}</small>` : ''}</td>
        <td><span class="badge">${p.category_name || p.category_id}</span></td>
        <td>$${Number(p.price).toFixed(2)}</td>
        <td>${p.customization_type || 'simple'}${p.promo_free_extras ? ' + 1 adicional gratis' : ''}</td>
        <td><span class="status-pill ${p.available ? 'available' : 'unavailable'}">${p.available ? 'Disponible' : 'Agotado'}</span></td>
        <td style="display: flex; gap: 5px;">
          <button title="Editar" onclick="editProduct('${p.id}', '${p.category_id}', '${escapeHtml(p.name)}', ${p.price}, '${escapeHtml(p.description || '')}', '${p.customization_type || 'simple'}', ${Boolean(p.promo_free_extras)}, ${p.available})">✏️</button>
          <button title="${p.available ? 'Ocultar' : 'Activar'}" onclick="toggleProduct('${p.id}', ${!p.available})">${p.available ? '👁️' : '◉'}</button>
          <button title="Eliminar" onclick="deleteProduct('${p.id}')">🗑️</button>
        </td>
      </tr>
    `).join('');
    updateProductCount();
  } catch (err) {
    console.error('Error al cargar productos:', err);
  }
}

function updateProductCount() {
  if (!productCount || !productsList) return;
  const rows = [...productsList.querySelectorAll('tr')];
  const visible = rows.filter(row => row.style.display !== 'none').length;
  const hasFilter = productSearch?.value.trim() || productFilterCategory?.value !== 'all';
  productCount.textContent = hasFilter ? `${visible} resultado${visible === 1 ? '' : 's'}` : `${rows.length} producto${rows.length === 1 ? '' : 's'} registrados`;
}

function filterProducts() {
  const query = productSearch.value.trim().toLowerCase();
  const category = productFilterCategory?.value || 'all';
  productsList.querySelectorAll('tr').forEach(row => {
    const matchesQuery = row.textContent.toLowerCase().includes(query);
    const matchesCategory = category === 'all' || row.dataset.categoryId === category;
    row.style.display = matchesQuery && matchesCategory ? '' : 'none';
  });
  updateProductCount();
}

if (productSearch) productSearch.addEventListener('input', filterProducts);
if (productFilterCategory) productFilterCategory.addEventListener('change', filterProducts);
if (prodCategorySelect) prodCategorySelect.addEventListener('change', () => {
  if (productFilterCategory) {
    productFilterCategory.value = prodCategorySelect.value;
    filterProducts();
  }
});

async function loadExtras(type = extraFilterType?.value || 'all') {
  try {
    const res = await fetch(`${API_URL}/admin/extras`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('admin_token');
      token = null;
      showLogin();
      return;
    }

    const extras = await readApiJson(res);
    const filteredExtras = type === 'all' ? extras : extras.filter(extra => extra.type === type);
    extrasList.innerHTML = filteredExtras.map(extra => `
      <tr>
        <td><strong>${escapeHtml(extra.name)}</strong></td>
        <td>${extraTypeLabels[extra.type] || extra.type}</td>
        <td>${extra.included ? 'Incluido' : `$${Number(extra.price).toFixed(2)}`}</td>
        <td><span class="status-pill ${extra.available ? 'available' : 'unavailable'}">${extra.available ? 'Disponible' : 'Agotado'}</span></td>
        <td style="display: flex; gap: 5px;">
          <button title="Editar" onclick="editExtra('${extra.id}', '${extra.type}', '${escapeHtml(extra.name)}', ${extra.price}, ${Boolean(extra.included)}, ${extra.available})">✏️</button>
          <button title="${extra.available ? 'Ocultar' : 'Activar'}" onclick="toggleExtra('${extra.id}', ${!extra.available})">${extra.available ? '👁️' : '◉'}</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar extras:', err);
  }
}

if (extraFilterType) extraFilterType.addEventListener('change', () => loadExtras(extraFilterType.value));

if (extraForm) {
  extraForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/admin/extras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: extraIdInput.value || null,
          type: extraTypeSelect.value,
          name: extraNameInput.value,
          price: parseFloat(extraPriceInput.value) || 0,
          included: extraIncludedCheck.checked,
          available: extraAvailableCheck.checked
        })
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || 'Error al guardar el extra');
      resetExtraForm();
      loadExtras();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function readApiJson(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`El servidor respondió HTTP ${res.status} en lugar de JSON. Ejecuta npm start y recarga el panel.`);
  }
  return res.json();
}

window.editExtra = function(id, type, name, price, included, available) {
  extraIdInput.value = id;
  extraTypeSelect.value = type;
  extraNameInput.value = name;
  extraPriceInput.value = price;
  extraIncludedCheck.checked = Boolean(included);
  extraAvailableCheck.checked = Boolean(available);
  updateExtraPriceState();
  cancelExtraBtn.classList.remove('hidden');
  extraForm.scrollIntoView({ behavior: 'smooth' });
};

window.toggleExtra = async function(id, available) {
  try {
    const res = await fetch(`${API_URL}/admin/extras/${id}/toggle`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ available })
    });
    if (!res.ok) throw new Error('No se pudo actualizar el extra');
    loadExtras();
  } catch (err) {
    alert(err.message);
  }
};

function resetExtraForm() {
  extraIdInput.value = '';
  extraForm.reset();
  extraPriceInput.value = '0';
  extraIncludedCheck.checked = false;
  extraAvailableCheck.checked = true;
  cancelExtraBtn.classList.add('hidden');
}

if (cancelExtraBtn) cancelExtraBtn.addEventListener('click', resetExtraForm);

function updateExtraPriceState() {
  const isFlavor = extraTypeSelect.value === 'icecream_flavor';
  const canBeIncluded = extraTypeSelect.value === 'burger' || isFlavor;
  if (isFlavor) extraIncludedCheck.checked = true;
  if (!canBeIncluded) extraIncludedCheck.checked = false;
  extraIncludedCheck.disabled = !canBeIncluded;
  extraPriceInput.disabled = isFlavor || extraIncludedCheck.checked;
  if (extraPriceInput.disabled) extraPriceInput.value = '0';
}

extraTypeSelect.addEventListener('change', () => {
  updateExtraPriceState();
  if (extraFilterType) {
    extraFilterType.value = extraTypeSelect.value;
    loadExtras(extraTypeSelect.value);
  }
});
extraIncludedCheck.addEventListener('change', updateExtraPriceState);
updateExtraPriceState();

// Guardar o Editar Producto / Promoción
if (productForm) {
  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      id: prodIdInput.value || null,
      category_id: prodCategorySelect.value,
      name: prodNameInput.value,
      price: parseFloat(prodPriceInput.value),
      description: prodDescInput.value,
      customization_type: prodCustomizationSelect.value,
      promo_free_extras: prodFreeExtrasCheck.checked,
      available: prodAvailableCheck ? prodAvailableCheck.checked : true
    };

    try {
      const res = await fetch(`${API_URL}/admin/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Error al guardar el producto');
      resetProductForm();
      loadProducts();
    } catch (err) {
      alert(err.message);
    }
  });
}

// Crear Nueva Categoría
if (categoryForm) {
  categoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: catNameInput.value,
      isCustomizable: catCustomCheck ? catCustomCheck.checked : false,
      isCustomIceCream: catIceCreamCheck ? catIceCreamCheck.checked : false
    };

    try {
      const res = await fetch(`${API_URL}/admin/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Error al crear la categoría');
      catNameInput.value = '';
      if (catCustomCheck) catCustomCheck.checked = false;
      if (catIceCreamCheck) catIceCreamCheck.checked = false;
      loadCategories();
      alert('Categoría creada exitosamente');
    } catch (err) {
      alert(err.message);
    }
  });
}

const roleLabels = { admin: 'Administrador', manager: 'Gerente', cashier: 'Caja' };

async function loadAdminUsers() {
  if (!adminUsersList) return;
  try {
    const res = await fetch(`${API_URL}/admin/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const users = await readApiJson(res);
    if (!res.ok) throw new Error(users.error || 'No se pudieron cargar los administradores');
    adminUsersList.innerHTML = users.map(user => `
      <tr>
        <td><strong>${escapeHtml(user.username)}</strong></td>
        <td>${roleLabels[user.role] || escapeHtml(user.role)}</td>
        <td><span class="status-pill ${user.active ? 'available' : 'unavailable'}">${user.active ? 'Activo' : 'Inactivo'}</span></td>
        <td>${user.created_at ? new Date(user.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('es-VE') : '-'}</td>
        <td style="display:flex;gap:5px;">
          <button title="Editar" onclick="editAdminUser(${user.id}, '${escapeHtml(user.username)}', '${user.role}', ${Boolean(user.active)})">✏️</button>
          <button title="Eliminar" onclick="deleteAdminUser(${user.id}, '${escapeHtml(user.username)}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

if (adminUserForm) {
  adminUserForm.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      id: adminUserId.value || null,
      username: adminUsername.value,
      password: adminPassword.value,
      role: adminRole.value,
      active: adminActive.checked
    };
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el administrador');
      resetAdminForm();
      loadAdminUsers();
      showNotice('Administrador guardado correctamente.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  });
}

window.editAdminUser = function(id, username, role, active) {
  adminUserId.value = id;
  adminUsername.value = username;
  adminPassword.value = '';
  adminPassword.placeholder = 'Dejar vacío para conservarla';
  adminRole.value = role;
  adminActive.checked = active;
  cancelAdminEdit.classList.remove('hidden');
  adminUsername.focus();
};

window.deleteAdminUser = async function(id, username) {
  if (!confirm(`¿Eliminar el acceso de ${username}?`)) return;
  try {
    const res = await fetch(`${API_URL}/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el administrador');
    loadAdminUsers();
    showNotice('Administrador eliminado.');
  } catch (err) {
    showNotice(err.message, 'error');
  }
};

function resetAdminForm() {
  adminUserForm.reset();
  adminUserId.value = '';
  adminActive.checked = true;
  adminPassword.placeholder = 'Mínimo 6 caracteres';
  cancelAdminEdit.classList.add('hidden');
}

if (cancelAdminEdit) cancelAdminEdit.addEventListener('click', resetAdminForm);

const preferences = JSON.parse(localStorage.getItem('admin_preferences') || '{}');
const notificationsSetting = document.getElementById('setting-notifications');
const confirmChargeSetting = document.getElementById('setting-confirm-charge');
if (notificationsSetting && preferences.notifications !== undefined) notificationsSetting.checked = preferences.notifications;
if (confirmChargeSetting && preferences.confirmCharge !== undefined) confirmChargeSetting.checked = preferences.confirmCharge;
document.getElementById('save-preferences')?.addEventListener('click', () => {
  localStorage.setItem('admin_preferences', JSON.stringify({
    notifications: notificationsSetting.checked,
    confirmCharge: confirmChargeSetting.checked
  }));
  showNotice('Preferencias guardadas.');
});
document.getElementById('logout-all-sessions')?.addEventListener('click', () => {
  if (confirm('¿Cerrar la sesión actual?')) logoutBtn.click();
});

// Cargar datos en el formulario para editar
window.editProduct = function(id, category_id, name, price, description, customizationType, promoFreeExtras, available) {
  prodIdInput.value = id;
  prodCategorySelect.value = category_id;
  prodNameInput.value = name;
  prodPriceInput.value = price;
  prodDescInput.value = description;
  prodCustomizationSelect.value = customizationType || 'simple';
  prodFreeExtrasCheck.checked = Boolean(promoFreeExtras);
  if (prodAvailableCheck) prodAvailableCheck.checked = Boolean(available);
  if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Resetear formulario de edición
if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', resetProductForm);
}

function resetProductForm() {
  prodIdInput.value = '';
  productForm.reset();
  prodCustomizationSelect.value = 'simple';
  prodFreeExtrasCheck.checked = false;
  if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
}

// Cambiar visibilidad
window.toggleProduct = async function(id, newStatus) {
  try {
    await fetch(`${API_URL}/admin/products/${id}/toggle`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ available: newStatus })
    });
    loadProducts();
  } catch (err) {
    console.error('Error al cambiar disponibilidad:', err);
  }
};

// Eliminar Producto
window.deleteProduct = async function(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) return;
  try {
    await fetch(`${API_URL}/admin/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadProducts();
  } catch (err) {
    console.error('Error al eliminar producto:', err);
  }
};

// Función auxiliar para escapar caracteres HTML en cadenas de texto
function escapeHtml(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}