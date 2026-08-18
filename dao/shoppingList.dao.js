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
  async create(userId, name, description = null) {
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

  // Add item to a list — if the same product/variant is already on the list,
  // bump its quantity instead of inserting a duplicate row.
  async addItem(listId, item) {
    const variantId = item.variantId || null;
    const existing = await prisma.shopping_list_items.findFirst({
      where: { list_id: listId, product_id: item.productId, variant_id: variantId },
    });

    if (existing) {
      const nextQuantity = Math.min(existing.quantity + (item.quantity || 1), 12);
      return await prisma.shopping_list_items.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
    }

    return await prisma.shopping_list_items.create({
      data: {
        list_id:    listId,
        product_id: item.productId,
        variant_id: variantId,
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
  // Used when user logs in and we merge localStorage lists into the DB.
  // Idempotent: re-running this with the same payload (e.g. because the client
  // re-fires the sync on every app remount) must never create duplicate lists
  // or duplicate items — it can only be called safely because shopping_lists
  // has a unique constraint on (user_id, name).
  async syncFromClient(userId, clientLists) {
    const results = [];
    for (const cl of clientLists) {
      const name = cl.name?.trim();
      if (!name) continue;

      const incomingItems = (cl.items || [])
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
        }));

      // Dedupe items within the incoming payload itself (same product+variant)
      const seen = new Set();
      const dedupedIncoming = incomingItems.filter((item) => {
        const key = `${item.product_id}:${item.variant_id || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const list = await prisma.shopping_lists.upsert({
        where: { user_id_name: { user_id: userId, name } },
        update: {},
        create: { user_id: userId, name, description: cl.description || null },
        include: { items: true },
      });

      // Only add items that aren't already on the (possibly pre-existing) list
      const existingKeys = new Set(
        list.items.map((i) => `${i.product_id}:${i.variant_id || ""}`)
      );
      const itemsToAdd = dedupedIncoming.filter(
        (item) => !existingKeys.has(`${item.product_id}:${item.variant_id || ""}`)
      );

      if (itemsToAdd.length > 0) {
        await prisma.shopping_list_items.createMany({
          data: itemsToAdd.map((item) => ({ ...item, list_id: list.id })),
        });
      }

      const finalList = await prisma.shopping_lists.findUnique({
        where: { id: list.id },
        include: { items: { orderBy: { added_at: "asc" } } },
      });
      results.push(finalList);
    }
    return results;
  }
}

export default new ShoppingListDAO();
