import prisma from "../config/prisma.js";

class WishlistDAO {
  async add(userId, productId) {
    return await prisma.wishlist_items.upsert({
      where: {
        user_id_product_id: {
          user_id: userId,
          product_id: productId,
        },
      },
      update: {},
      create: {
        user_id: userId,
        product_id: productId,
      },
    });
  }

  async remove(userId, productId) {
    return await prisma.wishlist_items.deleteMany({
      where: {
        user_id: userId,
        product_id: productId,
      },
    });
  }

  async listByUser(userId) {
    return await prisma.wishlist_items.findMany({
      where: { user_id: userId },
      include: {
        product: {
          include: {
            variants: {
              where: { active: true },
            },
          },
        },
      },
      orderBy: { added_at: "desc" },
    });
  }

  async clear(userId) {
    return await prisma.wishlist_items.deleteMany({
      where: { user_id: userId },
    });
  }

  async check(userId, productId) {
    const item = await prisma.wishlist_items.findUnique({
      where: {
        user_id_product_id: {
          user_id: userId,
          product_id: productId,
        },
      },
    });
    return !!item;
  }
}

export default new WishlistDAO();
