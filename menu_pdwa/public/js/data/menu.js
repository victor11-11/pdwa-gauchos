// Opciones estándar para Hamburguesas y Granjeros
export const BASE_TOPPINGS = [
  { id: "lechuga", name: "Lechuga" },
  { id: "tomate", name: "Tomate" },
  { id: "cebolla", name: "Cebolla" },
  { id: "papas_chips", name: "Papas Chips" },
  { id: "pepinillos", name: "Pepinillos" },
  { id: "picante", name: "Picante" },
  { id: "berenjenas", name: "Berenjenas Encurtidas" },
  { id: "zanahoria", name: "Zanahoria" }
];

export const BASE_SAUCES = [
  { id: "tomate_salsa", name: "Salsa de Tomate" },
  { id: "mayonesa", name: "Mayonesa" },
  { id: "mostaza", name: "Mostaza" },
  { id: "salsa_gauchos", name: "Salsa Gauchos" }
];

export const BURGER_EXTRAS = [
  { id: "tocineta", name: "Tocineta", price: 1.50 },
  { id: "queso", name: "Queso Extra", price: 1.00 },
  { id: "huevo", name: "Huevo", price: 1.00 }
];

export const MENU_DATA = [
  {
    id: "hamburguesas",
    name: "Hamburguesas",
    isCustomizable: true,
    products: [
      { id: "h1", name: "Res", price: 6.50 },
      { id: "h2", name: "Pollo Crispy", price: 7.00 },
      { id: "h3", name: "Gaucho", price: 8.00 },
      { id: "h4", name: "Gaucho a Caballo", price: 8.50 },
      { id: "h5", name: "Punta", price: 9.00 },
      { id: "h6", name: "Super Crispy", price: 8.00 }
    ]
  },
  {
    id: "granjeros",
    name: "Granjeros",
    isCustomizable: true,
    products: [
      { id: "g1", name: "Pollo Crispy", price: 6.00 },
      { id: "g2", name: "Lomito", price: 7.50 },
      { id: "g3", name: "Lomito con Champiñones", price: 8.00 },
      { id: "g4", name: "Atún", price: 6.00 },
      { id: "g5", name: "Pollo Teriyaki", price: 7.00 },
      { id: "g6", name: "Pollo a la Plancha", price: 6.50 }
    ]
  },
  {
    id: "entradas",
    name: "Entradas / Para Compartir",
    products: [
      { id: "e1", name: "Nachos", price: 5.50 },
      { id: "e2", name: "Papas con Chili", price: 6.00 },
      { id: "e3", name: "Carpaccio de Lomito", price: 9.00 },
      { id: "e4", name: "Tequeños", price: 5.00 },
      { id: "e5", name: "Ración de Papas Fritas", price: 3.50 },
      { id: "e6", name: "Tenders de Pollo", price: 6.50 }
    ]
  },
  {
    id: "ensaladas",
    name: "Ensaladas",
    products: [
      { id: "ens1", name: "César", price: 6.00 },
      { id: "ens2", name: "D'Roma", price: 7.00 }
    ]
  },
  {
    id: "pizzas",
    name: "Pizzas",
    isCustomPizza: true,
    baseName: "Margarita",
    sizes: [
      { id: "mediana", name: "Mediana", price: 8.00 },
      { id: "grande", name: "Grande", price: 12.00 }
    ],
    extras: [
      { id: "jamon", name: "Jamón", price: 1.50 },
      { id: "maiz", name: "Maíz", price: 1.00 },
      { id: "tocino", name: "Tocino", price: 2.00 },
      { id: "extra_queso", name: "Extra Queso", price: 2.00 }
    ]
  },
  {
    id: "bebidas",
    name: "Bebidas",
    products: [
      { id: "b1", name: "Refresco de Lata", price: 1.50 },
      { id: "b2", name: "Refresco Botella 300ml", price: 1.25 },
      { id: "b3", name: "Refresco 1L", price: 2.50 },
      { id: "b4", name: "Refresco 1.5L", price: 3.00 },
      { id: "b5", name: "Cervezas", price: 2.00 },
      { id: "b6", name: "Jugos Naturales", price: 2.00 },
      { id: "b7", name: "Agua Mineral", price: 1.00 }
    ]
  }
];