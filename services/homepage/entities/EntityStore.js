// Per-request accumulator for entities that are shared across sections (plan §12 "hybrid" normalization):
// only products and categories are normalized; everything else is inline in its section.
export class EntityStore {
  constructor() {
    this.products = new Map();
    this.categories = new Map();
  }

  addProduct(product) {
    if (product && product.id != null && !this.products.has(product.id)) this.products.set(product.id, product);
  }

  addCategory(category) {
    if (category && category.id != null && !this.categories.has(category.id)) this.categories.set(category.id, category);
  }

  /** Plain object for the response `entities` field. */
  toJSON() {
    return {
      products: Object.fromEntries(this.products),
      categories: Object.fromEntries(this.categories),
    };
  }
}
