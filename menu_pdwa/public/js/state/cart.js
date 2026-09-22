const CART_STORAGE_KEY = 'menu_cart_data';
const CART_SESSION_ID_KEY = 'menu_cart_session_id';

class CartState {
  constructor() {
    this.sessionId = this.getSessionId();
    this.items = this.loadCart();
  }

  createSessionId() {
    const randomPart = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return `cart-${randomPart}`;
  }

  getSessionId() {
    try {
      let sessionId = sessionStorage.getItem(CART_SESSION_ID_KEY);
      if (!sessionId) {
        sessionId = this.createSessionId();
        sessionStorage.setItem(CART_SESSION_ID_KEY, sessionId);
      }
      return sessionId;
    } catch (e) {
      console.warn('No se pudo leer el sessionId del carrito:', e);
      return this.createSessionId();
    }
  }

  getStorageKey() {
    return `${CART_STORAGE_KEY}:${this.sessionId}`;
  }

  loadCart() {
    try {
      const key = this.getStorageKey();
      const data = sessionStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }

      const legacyData = localStorage.getItem(CART_STORAGE_KEY);
      if (legacyData) {
        const parsed = JSON.parse(legacyData);
        if (Array.isArray(parsed)) {
          sessionStorage.setItem(key, JSON.stringify(parsed));
          localStorage.removeItem(CART_STORAGE_KEY);
          return parsed;
        }
      }

      return [];
    } catch (e) {
      console.error('Error al cargar el carrito desde la sesión local:', e);
      return [];
    }
  }

  saveCart() {
    try {
      sessionStorage.setItem(this.getStorageKey(), JSON.stringify(this.items));
    } catch (e) {
      console.error('Error al guardar el carrito:', e);
    }
  }

  getItems() {
    return Array.isArray(this.items) ? this.items : [];
  }

  toOrderPayload() {
    return {
      sessionId: this.sessionId,
      items: this.getItems().map(item => ({ ...item })),
      createdAt: new Date().toISOString()
    };
  }

  addItem(item) {
    if (!Array.isArray(this.items)) {
      this.items = [];
    }

    // Si es un producto simple (sin personalizaciones), agrupamos la cantidad
    if (!item.customizations) {
      const existing = this.items.find(i => i.id === item.id && !i.customizations);
      if (existing) {
        existing.quantity += item.quantity || 1;
      } else {
        this.items.push(item);
      }
    } else {
      // Si tiene personalizaciones (pizza/hamburguesa personalizada), entra como ítem nuevo
      this.items.push(item);
    }

    this.saveCart();
  }

  updateQuantity(id, delta) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.quantity += delta;
      if (item.quantity <= 0) {
        this.removeItem(id);
        return;
      }
      this.saveCart();
    }
  }

  removeItem(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.saveCart();
  }

  clearCart() {
    this.items = [];
    try {
      sessionStorage.removeItem(this.getStorageKey());
    } catch (e) {
      console.error('Error al limpiar la sesión del carrito:', e);
    }
  }
}

export const cartState = new CartState();