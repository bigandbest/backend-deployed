import prisma from "../config/prisma.js";

class OrderDAO {
  async create(data) {
    const { user_id, ...rest } = data;
    const createData = {
      ...rest,
    };

    if (user_id) {
      createData.users = { connect: { id: user_id } };
    }

    return await prisma.orders.create({
      data: createData,
    });
  }

  async getById(id) {
    return await prisma.orders.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        order_items: {
          include: {
            product_variants: {
              include: {
                products: {
                  include: {
                    media: {
                      where: { is_primary: true },
                      orderBy: { sort_order: "asc" },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
        order_tracking: {
          orderBy: {
            timestamp: "desc",
          },
        },
        coupon_usage: true,
        return_orders: {
          include: {
            return_order_items: true,
          },
        },
      },
    });
  }


  async update(id, data) {
    return await prisma.orders.update({
      where: { id },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  }

  async logicalDelete(id) {
    return await prisma.orders.update({
      where: { id },
      data: {
        is_deleted: true,
        updated_at: new Date(),
      },
    });
  }

  async delete(id) {
    return await prisma.orders.delete({
      where: { id },
    });
  }

  async listByUser(userId, pagination = {}) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    return await prisma.orders.findMany({
      where: {
        user_id: userId,
        is_deleted: false,
      },
      skip,
      take: limit,
      orderBy: {
        created_at: "desc",
      },
      include: {
        order_items: {
          take: 5,
          include: {
            product_variants: {
              include: {
                products: {
                  include: {
                    media: {
                      where: { is_primary: true },
                      orderBy: { sort_order: "asc" },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
        _count: {
          select: { order_items: true },
        },
      },
    });
  }

  async listAll(filters = {}, pagination = {}) {
    const { status, isDeleted = false, paymentMethod, userId } = filters;
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const whereClause = {
      is_deleted: isDeleted,
    };

    if (status) whereClause.status = status;
    if (paymentMethod) whereClause.payment_method = paymentMethod;
    if (userId) whereClause.user_id = userId;

    const [items, total] = await Promise.all([
      prisma.orders.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          created_at: "desc",
        },
        include: {
          users: {},
          order_items: {
            include: {
              product_variants: {
                include: {
                  products: {
                    include: {
                      media: {
                        where: { is_primary: true },
                        orderBy: { sort_order: "asc" },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.orders.count({
        where: whereClause,
      }),
    ]);

    return { items, total, page, limit };
  }
}

export default new OrderDAO();
