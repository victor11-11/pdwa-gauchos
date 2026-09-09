const API_URL = '/api';
let token = localStorage.getItem('admin_token');

const loginSection = document.getElementById('login-section');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const productsList = document.getElementById('products-list');
const logoutBtn = document.getElementById('logout-btn');

// Inicialización de la vista
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
  loadProducts();
}

// Evento de inicio de sesión
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

// Evento de cierre de sesión
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  token = null;
  showLogin();
});

// Cargar lista de productos desde el servidor
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
        <td><strong>${p.name}</strong></td>
        <td>$${Number(p.price).toFixed(2)}</td>
        <td>${p.available ? '🟢 Disponible' : '🔴 Agotado'}</td>
        <td>
          <button onclick="toggleProduct('${p.id}', ${!p.available})" style="width: auto; padding: 5px 10px;">
            ${p.available ? 'Desactivar' : 'Activar'}
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar productos:', err);
  }
}

// Cambiar visibilidad de producto
async function toggleProduct(id, newStatus) {
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
}