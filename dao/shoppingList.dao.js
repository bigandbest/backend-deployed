import prisma from "../config/prisma.js";

class ShoppingListDAO {
  // Get all lists (with items) for a user
  async getAllByUser(userId) {
    return await prisma.shopping_lists.findMany({
      where: { user_id: userId },
      include: {
        items: {
          orderBy: { added_at: "asc" },
        },
      },
      orderBy: { created_at: "asc" },
    });
  }

  // Create a new list
  async create(userId, name, description = "") {
    return await prisma.shopping_lists.create({
      data: { user_id: userId, name, description },
      include: { items: true },
    });
  }

  // Get single list (ownership-checked by caller)
  async getById(listId) {
    return await prisma.shopping_lists.findUnique({
      where: { id: listId },
      include: { items: { orderBy: { added_at: "asc" } } },
    });
  }

  // Rename a list
  async rename(listId, name) {
    return await prisma.shopping_lists.update({
      where: { id: listId },
      data: { name },
    });
  }

  // Delete a list (cascades to items)
  async delete(listId) {
    return await prisma.shopping_lists.delete({ where: { id: listId } });
  }

  // Add item to a list
  async addItem(listId, item) {
    return await prisma.shopping_list_items.create({
      data: {
        list_id:    listId,
        product_id: item.productId,
        variant_id: item.variantId || null,
        name:       item.name,
        price:      item.price,
        old_price:  item.old_price || null,
        image:      item.image || null,
        brand:      item.brand || null,
        weight:     item.weight || null,
        quantity:   item.quantity || 1,
      },
    });
  }

  // Remove a single item by its id
  async removeItem(itemId) {
    return await prisma.shopping_list_items.delete({ where: { id: itemId } });
  }

  // Update quantity of an item
  async updateItemQuantity(itemId, quantity) {
    return await prisma.shopping_list_items.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  // Check ownership
  async isOwner(listId, userId) {
    const list = await prisma.shopping_lists.findUnique({
      where: { id: listId },
      select: { user_id: true },
    });
    return list?.user_id === userId;
  }

  // Sync: upsert lists from client payload
  // Used when user logs in and we merge localStorage lists into the DB
  async syncFromClient(userId, clientLists) {
    const results = [];
    for (const cl of clientLists) {
      // Create the list
      const list = await prisma.shopping_lists.create({
        data: {
          user_id: userId,
          name: cl.name,
          description: cl.description || "",
          items: {
            create: (cl.items || [])
              .filter((item) => item.productId)
              .map((item) => ({
                product_id: item.productId,
                variant_id: item.variantId || null,
                name:       item.name,
                price:      item.price,
                old_price:  item.old_price || null,
                image:      item.image || null,
                brand:      item.brand || null,
                weight:     item.weight || null,
                quantity:   item.quantity || 1,
              })),
          },
        },
        include: { items: true },
      });
      results.push(list);
    }
    return results;
  }
}

export default new ShoppingListDAO();
