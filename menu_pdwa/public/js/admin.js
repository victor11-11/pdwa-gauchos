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
    const data = await fetchJsonWithWarmup('/api/tasas');
    const usd = Number(data.tasa_usd || 0);
    const eur = Number(data.tasa_eur || 0);
    const usdTexto = data.tasa_usd_texto || String(usd);
    const eurTexto = data.tasa_eur_texto || String(eur);
    const active = String(data.moneda_activa || 'USD').toUpperCase();
    const updated = data.ultima_actualizacion ? new Date(data.ultima_actualizacion).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin actualización';
    const ageMs = data.ultima_actualizacion ? Date.now() - new Date(data.ultima_actualizacion).getTime() : Infinity;
    const isStale = !(ageMs < 6 * 60 * 60 * 1000);

    window.__bcvRate = active === 'EUR' ? eur : usd;
    if (bcvRateValue) {
      bcvRateValue.textContent = `USD ${usdTexto} · EUR ${eurTexto}`;
    }
    if (bcvRateMeta) {
      const warning = data.ultimo_error ? ` · ${data.ultimo_error}` : (isStale ? ' · tasa vencida, reintentando' : '');
      bcvRateMeta.textContent = `Actualizado ${updated} · Activa: ${active}${warning}`;
    }
    if (bcvCurrencySelect) {
      bcvCurrencySelect.value = active;
    }
    if (document.getElementById('client-bcv-rate')) {
      const rateTexto = active === 'EUR' ? eurTexto : usdTexto;
      document.getElementById('client-bcv-rate').textContent = `${active}: ${rateTexto} Bs`;
    }
    const headerBadge = document.getElementById('bcv-header-badge');
    if (headerBadge) {
      const activeTexto = active === 'EUR' ? eurTexto : usdTexto;
      headerBadge.textContent = `Tasa BCV: ${activeTexto} Bs/$`;
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
    const data = await fetchJsonWithWarmup('/api/tasas/actualizar', { method: 'POST' });
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
    const original = printerTestButton.textContent;
    printerTestButton.disabled = true;
    printerTestButton.textContent = 'Imprimiendo…';
    try {
      const res = await fetch(`${API_URL}/admin/printers/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la prueba de impresión');
      // El mensaje distingue "salió papel" de "se envió". Antes esas dos cosas
      // iban juntas, y por eso se informaba éxito con la impresora desconectada.
      showNotice(data.message || 'Prueba enviada.', data.printed === true ? 'success' : 'error');
      loadPrinters();
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      printerTestButton.disabled = false;
      printerTestButton.textContent = original;
    }
  });
}

// ------------------------------------------------------------------
// Panel de impresoras
//
// Todo aquí parte de una sola idea: el sistema sabe qué impresora hay conectada
// de verdad, y el usuario solo tiene que decidir qué hace cada una. Nada de
// escribir nombres de marca a mano.
// ------------------------------------------------------------------

const printersState = { data: null, cargando: false };

const printersEl = (id) => document.getElementById(id);

const apiPrinters = async (ruta, opciones = {}) => {
  const res = await fetch(`${API_URL}/admin/printers${ruta}`, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(opciones.headers || {}) }
  });
  const data = await readApiJson(res);
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
};

/** Traduce el estado interno a algo que un dueño de restaurante entienda. */
const ESTADO_COLA = {
  connected: { texto: 'Conectada', clase: 'ok' },
  'device-missing': { texto: 'Impresora desconectada', clase: 'bad' },
  network: { texto: 'En red', clase: 'warn' },
  orphan: { texto: 'No verificable', clase: 'warn' },
  disabled: { texto: 'Desactivada', clase: 'muted' }
};

const renderPrinters = () => {
  const data = printersState.data;
  if (!data) return;
  const agente = data.agente || {};
  const impresorasDelEquipo = agente.conectado ? (agente.impresoras || []) : (data.impresoras || []);
  const rolesMostrados = agente.conectado
    ? (agente.logicas || []).map(role => ({
      ...role,
      colaActual: role.destino || null,
      estadoVinculada: impresorasDelEquipo.find(printer => printer.cola === role.destino)?.estado || null
    }))
    : (data.logicas || []);

  // --- avisos (duplicadas, sin impresoras, etc.) ---
  const avisos = [];
  for (const dup of data.duplicadas || []) avisos.push(dup.aviso);
  if (!agente.conectado && data.cupsDisponible === false) {
    avisos.push('Agente de impresión desconectado: Render no puede usar el CUPS ni la USB de tu computadora. Inicia impresor_local.js en el equipo de la impresora; ese agente imprimirá usando el CUPS local.');
  }
  for (const logica of rolesMostrados) {
    if (!logica.destino && !logica.colaActual) avisos.push(`No hay impresora para "${logica.label}". Conecta una y asígnala aquí.`);
  }
  const alertBox = printersEl('printers-avisos');
  if (avisos.length && alertBox) {
    alertBox.innerHTML = avisos.map(a => `<div class="printers-alert">⚠ ${escapeHtml(a)}</div>`).join('');
    alertBox.hidden = false;
  } else if (alertBox) {
    alertBox.hidden = true;
  }

  // --- resumen ---
  const status = printersEl('printers-status');
  const conectadas = impresorasDelEquipo.filter(p => p.estado === 'connected');
  if (status) {
    if (agente.conectado) {
      status.textContent = data.notaImpresion || 'Las comandas se envían a la ticketera del agente.';
    } else if (data.cupsDisponible === false) {
      status.textContent = 'Render no tiene acceso al CUPS de la impresora. Inicia impresor_local.js en el equipo de la ticketera; el agente usará allí CUPS para imprimir.';
    } else if (conectadas.length) {
      status.textContent = `${conectadas.length} impresora${conectadas.length > 1 ? 's' : ''} lista${conectadas.length > 1 ? 's' : ''} para usar en este equipo.`;
    } else {
      status.textContent = 'No hay ninguna impresora conectada ahora mismo.';
    }
  }

  // Inventario que reportó el agente de otro equipo. Se muestra aparte porque no
  // son las impresoras de este servidor y mezclarlas confundiría.
  const listaAgente = printersEl('printers-agente-lista');
  const bloqueAgente = printersEl('printers-agente');
  if (bloqueAgente && listaAgente) {
    bloqueAgente.hidden = !agente.conectado;
    if (agente.conectado) {
      const impresoras = agente.impresoras || [];
      listaAgente.innerHTML = impresoras.length
        ? impresoras.map(p => {
          const estado = ESTADO_COLA[p.estado] || { texto: p.estado, clase: 'muted' };
          return `<div class="printer-row compact">
              <div class="printer-row-main">
                <div class="printer-row-name">${escapeHtml(p.cola)} <span class="badge ${estado.clase}">${escapeHtml(estado.texto)}</span></div>
                <div class="printer-row-sub">${escapeHtml(p.modelo || 'modelo desconocido')}${p.pendientes ? ` · ${p.pendientes} pendiente(s)` : ''}</div>
                ${p.motivo ? `<div class="printer-row-why">${escapeHtml(p.motivo)}</div>` : ''}
              </div>
            </div>`;
        }).join('')
        : '<p class="section-note">El agente está conectado pero no ha reportado ninguna impresora.</p>';
    }
  }

  // --- roles ---
  const grid = printersEl('printers-logicas');
  if (grid) {
    const bindings = rolesMostrados;
    if (!bindings.length) {
      grid.innerHTML = '<p class="section-note">No hay impresoras lógicas configuradas.</p>';
    } else {
      grid.innerHTML = bindings.map(p => {
        const colaVinculada = impresorasDelEquipo.find(c => c.cola === p.colaActual);
        const estado = ESTADO_COLA[p.estadoVinculada] || (p.colaActual ? { texto: 'Conectada', clase: 'ok' } : { texto: 'Sin asignar', clase: 'warn' });
        const opciones = impresorasDelEquipo
          .filter(c => c.estado === 'connected')
          .map(c => `<option value="${escapeHtml(c.cola)}" ${c.cola === p.colaActual ? 'selected' : ''}>${escapeHtml(c.modelo || c.cola)} (${escapeHtml(c.cola)})</option>`)
          .join('');

        return `
          <div class="printer-role" data-role="${escapeHtml(p.id)}">
            <div class="printer-role-head">
              <strong>${escapeHtml(p.label)}</strong>
              <span class="badge ${estado.clase}">${escapeHtml(estado.texto)}</span>
            </div>
            <div class="printer-role-target">
              ${p.colaActual ? escapeHtml(colaVinculada?.modelo || p.colaActual) : '<em>sin asignar</em>'}
            </div>
            ${['auto', 'auto-thermal', 'auto-default'].includes(p.origen) && p.colaActual ? '<div class="printer-role-hint">Elegida automáticamente</div>' : ''}
            ${p.motivo ? `<div class="printer-role-hint">${escapeHtml(p.motivo)}</div>` : ''}
            <div class="printer-role-actions">
              <select class="printer-select" ${opciones && !agente.conectado ? '' : 'disabled'} data-role="${escapeHtml(p.id)}">
                ${opciones ? opciones : '<option value="">Ninguna conectada</option>'}
              </select>
              <button type="button" class="ghost-button" data-printer-action="test" data-role="${escapeHtml(p.id)}" ${p.colaActual ? '' : 'disabled'}>Probar</button>
              <button type="button" class="ghost-button" data-printer-action="toggle" data-role="${escapeHtml(p.id)}" ${agente.conectado ? 'disabled title="Cambia esta opción en el equipo del agente"' : ''}>${p.enabled ? 'Apagar' : 'Encender'}</button>
            </div>
          </div>`;
      }).join('');
    }
  }

  // --- colas del sistema ---
  const listaColas = printersEl('printers-colas');
  if (listaColas) {
    const impresoras = data.impresoras || [];
    if (!impresoras.length) {
      listaColas.innerHTML = '<p class="section-note">No hay ninguna cola de impresión instalada.</p>';
    } else {
      listaColas.innerHTML = impresoras.map(p => {
        const estado = ESTADO_COLA[p.estado] || { texto: p.estado, clase: 'muted' };
        const detalle = [p.marca, p.usb, p.serial].filter(Boolean).join(' · ');
        return `
          <div class="printer-row">
            <div class="printer-row-main">
              <div class="printer-row-name">${escapeHtml(p.cola)} <span class="badge ${estado.clase}">${escapeHtml(estado.texto)}</span></div>
              <div class="printer-row-sub">${escapeHtml(p.modelo || 'modelo desconocido')}${detalle ? ` · ${escapeHtml(detalle)}` : ''}</div>
              <div class="printer-row-why">${escapeHtml(p.motivo || '')}</div>
              ${p.pendientes > 0 ? `<div class="printer-row-warn">${p.pendientes} trabajo(s) esperando. La impresora no los está recibiendo.</div>` : ''}
            </div>
            <div class="printer-row-actions">
              <button type="button" class="ghost-button" data-printer-action="test" data-queue="${escapeHtml(p.cola)}" ${p.estado === 'connected' ? '' : 'disabled'}>Probar</button>
            </div>
          </div>`;
      }).join('');
    }
  }

  // --- equipos conectados sin cola ---
  const nuevos = data.sinAprovisionar || [];
  const boxNuevo = printersEl('printers-unprovisioned');
  const listaNuevos = printersEl('printers-nuevos');
  if (boxNuevo && listaNuevos) {
    boxNuevo.hidden = nuevos.length === 0;
    if (nuevos.length) {
      listaNuevos.innerHTML = nuevos.map(d => `
        <div class="printer-row">
          <div class="printer-row-main">
            <div class="printer-row-name">${escapeHtml(d.modelo || 'Equipo sin identificar')}</div>
            <div class="printer-row-sub">${escapeHtml([d.marca, d.usb, d.serial].filter(Boolean).join(' · '))}</div>
            <div class="printer-row-why">Conectada, pero sin una cola donde imprimir.</div>
          </div>
          <div class="printer-row-actions">
            <button type="button" class="primary-button" data-printer-action="provision" data-serial="${escapeHtml(d.serial)}">Preparar</button>
          </div>
        </div>`).join('');
    }
  }

  // --- historial ---
  renderJobs(data.resumenTrabajos);
};

const renderJobs = (resumen) => {
  const lista = printersEl('printers-jobs-list');
  const etiqueta = printersEl('printers-jobs-summary');
  if (etiqueta && resumen) {
    const partes = [];
    if (resumen.byStatus?.printed) partes.push(`${resumen.byStatus.printed} impresos`);
    if (resumen.byStatus?.stuck) partes.push(`${resumen.byStatus.stuck} atascados`);
    if (resumen.byStatus?.failed) partes.push(`${resumen.byStatus.failed} con error`);
    etiqueta.textContent = partes.length ? `· ${partes.join(', ')}` : '';
  }
  if (!lista) return;
  if (!resumen || !resumen.total) {
    lista.innerHTML = '<p class="section-note">Todavía no se ha impreso nada en esta sesión.</p>';
    return;
  }
  if (!resumen.recientes) {
    lista.innerHTML = '<p class="section-note">Consulta el historial para ver el detalle.</p>';
  }
};

const loadJobs = async () => {
  const lista = printersEl('printers-jobs-list');
  if (!lista) return;
  try {
    const data = await apiPrinters('/jobs?limit=20');
    const etiqueta = printersEl('printers-jobs-summary');
    const s = data.resumen || {};
    if (etiqueta) {
      const partes = [];
      if (s.byStatus?.printed) partes.push(`${s.byStatus.printed} impresos`);
      if (s.byStatus?.stuck) partes.push(`${s.byStatus.stuck} atascados`);
      if (s.byStatus?.failed) partes.push(`${s.byStatus.failed} con error`);
      etiqueta.textContent = partes.length ? `· ${partes.join(', ')}` : '';
    }

    if (!data.jobs?.length) {
      lista.innerHTML = '<p class="section-note">Todavía no se ha impreso nada en esta sesión.</p>';
      return;
    }

    const ETIQUETA = {
      printed: ['Impreso', 'ok'],
      sent: ['Enviado', 'warn'],
      sending: ['Enviando', 'warn'],
      stuck: ['Atascado', 'bad'],
      failed: ['Error', 'bad'],
      unconfirmable: ['Sin confirmar', 'warn']
    };

    lista.innerHTML = data.jobs.map(job => {
      const [texto, clase] = ETIQUETA[job.status] || [job.status, 'muted'];
      const cuando = new Date(job.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="printer-row compact">
          <div class="printer-row-main">
            <div class="printer-row-name">${escapeHtml(texto)} · ${escapeHtml(job.queue || 'sin destino')} <span class="badge ${clase}">${escapeHtml(job.role || '')}</span></div>
            <div class="printer-row-sub">${cuando}${job.cupsJobId ? ` · ${escapeHtml(job.cupsJobId)}` : ''}${job.waitedMs != null ? ` · ${job.waitedMs}ms` : ''}</div>
            ${job.reason ? `<div class="printer-row-why">${escapeHtml(job.reason)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    lista.innerHTML = `<p class="section-note">${escapeHtml(err.message)}</p>`;
  }
};

const loadPrinters = async (forzar = false, detectarHardware = false) => {
  if (printersState.cargando && !forzar) return;
  printersState.cargando = true;
  try {
    printersState.data = await apiPrinters(detectarHardware ? '?refresh=1' : '');
    renderPrinters();
    loadJobs();
    return printersState.data;
  } catch (err) {
    const status = printersEl('printers-status');
    if (status) status.textContent = err.message;
    return null;
  } finally {
    printersState.cargando = false;
  }
};

const printersRefresh = printersEl('printers-refresh');
if (printersRefresh) {
  printersRefresh.addEventListener('click', async () => {
    printersRefresh.disabled = true;
    const original = printersRefresh.textContent;
    printersRefresh.textContent = 'Detectando…';
    try {
      const data = await loadPrinters(true, true);
      if (!data) return;
      if (data.avisoDeteccion) {
        showNotice(data.avisoDeteccion, 'error');
      } else {
        showNotice('Inventario de impresoras actualizado.');
      }
    } finally {
      printersRefresh.disabled = false;
      printersRefresh.textContent = original;
    }
  });
}

// Un solo manejador para todos los botones: la tarjeta se vuelve a pintar
// después de cada acción, así que no hay que reconectar nada.
document.getElementById('printers-card')?.addEventListener('click', async (event) => {
  const boton = event.target.closest('[data-printer-action]');
  if (!boton) return;

  const accion = boton.dataset.printerAction;
  const rol = boton.dataset.role;
  const cola = boton.dataset.queue;
  const serial = boton.dataset.serial;
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = '…';

  try {
    if (accion === 'test') {
      const data = await apiPrinters('/test', {
        method: 'POST',
        body: JSON.stringify({ queue: cola || null, role: rol || null })
      });
      showNotice(data.message || 'Prueba enviada.', data.printed === true ? 'success' : 'warning');
    }

    if (accion === 'provision') {
      const data = await apiPrinters('/provision', { method: 'POST', body: JSON.stringify({ serial }) });
      showNotice(data.message || 'Impresora preparada.');
    }

    if (accion === 'toggle') {
      const actual = printersState.data?.logicas?.find(p => p.id === rol);
      const data = await apiPrinters('/toggle', { method: 'POST', body: JSON.stringify({ logicalId: rol, enabled: !actual?.enabled }) });
      showNotice(data.message || 'Estado cambiado.');
    }

    await loadPrinters(true);
  } catch (err) {
    showNotice(err.message, 'error');
    boton.disabled = false;
    boton.textContent = original;
  }
});

// Al cambiar el desplegable se enlaza esa cola al rol.
document.getElementById('printers-card')?.addEventListener('change', async (event) => {
  const select = event.target.closest('.printer-select');
  if (!select) return;

  const logicalId = select.dataset.role;
  const queue = select.value;
  select.disabled = true;

  try {
    if (!queue) {
      await apiPrinters('/unbind', { method: 'POST', body: JSON.stringify({ logicalId }) });
      showNotice('Se quitó la asignación. Ahora se elige automáticamente.');
    } else {
      const data = await apiPrinters('/bind', { method: 'POST', body: JSON.stringify({ logicalId, queue }) });
      showNotice(data.message, data.connected ? 'success' : 'warning');
    }
    await loadPrinters(true);
  } catch (err) {
    showNotice(err.message, 'error');
    select.disabled = false;
  }
});

const clearStuckButton = printersEl('printers-clear-stuck');
if (clearStuckButton) {
  clearStuckButton.addEventListener('click', async () => {
    clearStuckButton.disabled = true;
    const original = clearStuckButton.textContent;
    clearStuckButton.textContent = 'Limpiando…';
    try {
      const data = await apiPrinters('/clear-stuck', { method: 'POST', body: JSON.stringify({}) });
      showNotice(data.message || 'Colas limpiadas.');
      await loadPrinters(true);
      await loadJobs();
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      clearStuckButton.disabled = false;
      clearStuckButton.textContent = original;
    }
  });
}

// El panel de impresoras solo se consulta con sesión iniciada. Antes se pedía
// igualmente y el usuario veía un error de autenticación nada más abrir.
const pedirPrintersSiHaySesion = () => {
  if (!token) return;
  if (printersEl('printers-card')) loadPrinters();
};

// Al final del archivo, cuando ya existen todas las definiciones: si venía una
// sesión guardada, el panel aparece con las impresoras ya detectadas.
pedirPrintersSiHaySesion();

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
setInterval(() => {
  if (document.visibilityState === 'visible') loadBcvRates();
}, 60000);

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
    // Las impresoras se detectan al entrar: si alguien enchufó una justo antes,
    // el panel la ve sin tener que recargar.
    pedirPrintersSiHaySesion();
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

// En Render la instancia se duerme: la primera respuesta puede ser el HTML de
// "spinning up" o un 503 en vez de JSON. Un reintento tras esperar lo resuelve.
async function fetchJsonWithWarmup(url, options = {}, attempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(url, { cache: 'no-store', ...options });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || `El servidor respondió HTTP ${res.status}.`);
      return data;
    }
    lastError = new Error(`El servidor respondió HTTP ${res.status} en lugar de JSON. Espera unos segundos y reintenta.`);
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw lastError;
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

// Escapa texto antes de meterlo en innerHTML. La versión anterior solo cambiaba
// comillas: "<img onerror=...>" pasaba intacto y era un XSS en todo el panel,
// que además renderiza nombres de productos y de impresoras.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}