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
const prodAvailableCheck = document.getElementById('prod-available');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Formulario de Categorías
const categoryForm = document.getElementById('category-form');
const catNameInput = document.getElementById('cat-name');
const catCustomCheck = document.getElementById('cat-customizable');
const catIceCreamCheck = document.getElementById('cat-icecream');

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
        <td>${p.available ? '🟢 Disponible' : '🔴 Agotado'}</td>
        <td style="display: flex; gap: 5px;">
          <button onclick="editProduct('${p.id}', '${p.category_id}', '${escapeHtml(p.name)}', ${p.price}, '${escapeHtml(p.description || '')}', ${p.available})" style="width: auto; padding: 5px 10px; background:#e0a800;">
            Editar
          </button>
          <button onclick="toggleProduct('${p.id}', ${!p.available})" style="width: auto; padding: 5px 10px;">
            ${p.available ? 'Desactivar' : 'Activar'}
          </button>
          <button onclick="deleteProduct('${p.id}')" style="width: auto; padding: 5px 10px; background:#dc3545;">
            Eliminar
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar productos:', err);
  }
}

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

// Cargar datos en el formulario para editar
window.editProduct = function(id, category_id, name, price, description, available) {
  prodIdInput.value = id;
  prodCategorySelect.value = category_id;
  prodNameInput.value = name;
  prodPriceInput.value = price;
  prodDescInput.value = description;
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