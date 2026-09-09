const CART_STORAGE_KEY = 'menu_cart_data';

class CartState {
  constructor() {
    this.items = this.loadCart();
  }

  loadCart() {
    try {
      const data = localStorage.getItem(CART_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al cargar el carrito desde localStorage:', e);
      return [];
    }
  }

  saveCart() {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(this.items));
    } catch (e) {
      console.error('Error al guardar el carrito:', e);
    }
  }

  getItems() {
    return this.items || [];
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
      // Si tiene personalizaciones (pizza), entra como ítem nuevo
      this.items.push(item);
    }

    this.saveCart();
  }

  clearCart() {
    this.items = [];
    this.saveCart();
  }
}

export const cartState = new CartState();