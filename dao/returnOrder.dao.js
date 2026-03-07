import prisma from "../config/prisma.js";

class ReturnOrderDAO {
  async create(data, items = []) {
    return await prisma.$transaction(async (tx) => {
      const returnOrder = await tx.return_orders.create({
        data: {
          ...data,
          processed_at: data.status === "completed" ? new Date() : null,
        },
      });

      if (items.length > 0) {
        const returnItems = items.map((item) => ({
          return_order_id: returnOrder.id,
          order_item_id: item.order_item_id,
          quantity: item.quantity,
          return_reason: item.reason,
        }));

        await tx.return_order_items.createMany({
          data: returnItems,
        });
      }

      return returnOrder;
    });
  }

  async findById(id) {
    return await prisma.return_orders.findUnique({
      where: { id },
      include: {
        return_order_items: {
          include: {
            order_item: {
              include: {
                product_variants: true,
              },
            },
          },
        },
        users: { select: { name: true, email: true } },
        orders: true,
      },
    });
  }

  async findByOrderId(orderId) {
    return await prisma.return_orders.findFirst({
      where: { order_id: orderId },
    });
  }

  async listByUser(userId, limit = 10, offset = 0) {
    return await prisma.return_orders.findMany({
      where: { user_id: userId },
      include: {
        users: { select: { name: true } },
        orders: { select: { id: true, payment_method: true } },
      },
      orderBy: { created_at: "desc" },
      take: Number(limit),
      skip: Number(offset),
    });
  }

  async listAll(filters = {}, limit = 50, offset = 0) {
    const { status } = filters;
    return await prisma.return_orders.findMany({
      where: {
        ...(status && { status }),
      },
      include: {
        users: { select: { name: true } },
        orders: true,
      },
      orderBy: { created_at: "desc" },
      take: Number(limit),
      skip: Number(offset),
    });
  }

  async update(id, data) {
    return await prisma.return_orders.update({
      where: { id },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  }

  async delete(id) {
    // delete items first? Prisma cascade handles it if configured, schema has onDelete: Cascade
    return await prisma.return_orders.delete({
      where: { id },
    });
  }
}

export default new ReturnOrderDAO();
