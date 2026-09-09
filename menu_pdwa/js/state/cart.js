class CartState {
  constructor() {
    this.items = [];
  }

  addItem(item) {
    // Para items simples o pizzas configuradas
    this.items.push(item);
    this.notify();
  }

  removeItem(index) {
    this.items.splice(index, 1);
    this.notify();
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }

  getItems() {
    return this.items;
  }

  notify() {
    const totalEl = document.getElementById("cart-total");
    const countEl = document.getElementById("cart-count");
    const barEl = document.getElementById("cart-bar");

    if (totalEl) totalEl.textContent = `$${this.getTotal().toFixed(2)}`;
    if (countEl) countEl.textContent = `${this.items.length} items`;
    
    if (barEl) {
      if (this.items.length > 0) {
        barEl.classList.remove("hidden");
      } else {
        barEl.classList.add("hidden");
      }
    }
  }
}

export const cart = new CartState();