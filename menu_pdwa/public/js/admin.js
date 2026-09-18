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

// Formulario de Categorías
const categoryForm = document.getElementById('category-form');
const catNameInput = document.getElementById('cat-name');
const catCustomCheck = document.getElementById('cat-customizable');
const catIceCreamCheck = document.getElementById('cat-icecream');
const productSearch = document.getElementById('product-search');
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

function activateView(view) {
  document.querySelectorAll('[data-view]:not(.nav-item)').forEach(section => {
    section.classList.toggle('admin-view-hidden', section.dataset.view !== view);
  });
  document.querySelectorAll('.nav-item[data-view]').forEach(navItem => {
    navItem.classList.toggle('active', navItem.dataset.view === view);
  });
  const dashboardGrid = document.querySelector('.dashboard-grid');
  if (dashboardGrid) dashboardGrid.classList.toggle('admin-view-hidden', !['pos', 'reports'].includes(view));
}

document.querySelectorAll('.nav-item[data-view]').forEach(item => {
  item.addEventListener('click', () => {
    activateView(item.dataset.view);
  });
});

activateView('dashboard');

document.querySelectorAll('.table-action').forEach(button => {
  button.addEventListener('click', () => {
    const card = button.closest('.table-status-card');
    const table = card.dataset.table;
    if (card.dataset.status === 'available') {
      card.dataset.status = 'occupied';
      card.querySelector('.status-pill').className = 'status-pill unavailable';
      card.querySelector('.status-pill').textContent = 'Ocupada';
      card.querySelector('p').textContent = 'Cuenta activa · $0.00';
      button.textContent = 'Ver cuenta';
      showNotice(`Cuenta abierta en la mesa ${table}.`);
    } else {
      showNotice(`Mostrando la cuenta de la mesa ${table}.`);
    }
  });
});

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

const saveSaleButton = document.getElementById('save-sale-btn');
if (saveSaleButton) saveSaleButton.addEventListener('click', () => {
  localStorage.setItem('draft_sale', JSON.stringify({ savedAt: new Date().toISOString(), total: 150 }));
  showNotice('Venta guardada como borrador.');
});

const chargeSaleButton = document.getElementById('charge-sale-btn');
if (chargeSaleButton) chargeSaleButton.addEventListener('click', () => {
  const confirmCharge = JSON.parse(localStorage.getItem('admin_preferences') || '{}').confirmCharge !== false;
  if (confirmCharge && !confirm('¿Confirmar el cobro de $150.00?')) return;
  fetch(`${API_URL}/admin/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ total: 150, tablesServed: 1 })
  })
    .then(readApiJson)
    .then(data => {
      if (data.error) throw new Error(data.error);
      localStorage.removeItem('draft_sale');
      chargeSaleButton.disabled = true;
      chargeSaleButton.textContent = 'Cobrado';
      loadDashboard();
      showNotice('Cobro registrado correctamente.');
    })
    .catch(err => showNotice(err.message, 'error'));
});

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
      <tr>
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
  productCount.textContent = productSearch?.value ? `${visible} resultado${visible === 1 ? '' : 's'}` : `${rows.length} producto${rows.length === 1 ? '' : 's'} registrados`;
}

function filterProducts() {
  const query = productSearch.value.trim().toLowerCase();
  productsList.querySelectorAll('tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
  updateProductCount();
}

if (productSearch) productSearch.addEventListener('input', filterProducts);

async function loadExtras() {
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
    extrasList.innerHTML = extras.map(extra => `
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
    throw new Error(`El servidor respondió HTTP ${res.status} en lugar de JSON. Reinicia npm start y recarga el panel.`);
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

extraTypeSelect.addEventListener('change', updateExtraPriceState);
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