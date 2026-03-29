import prisma from "../config/prisma.js";

class RefundRequestDAO {
  async create(data) {
    return await prisma.refund_requests.create({ data });
  }

  async findById(id) {
    return await prisma.refund_requests.findUnique({
      where: { id },
      include: {
        orders: { select: { id: true, total: true, created_at: true, status: true, payment_method: true } },
        users_refund_requests_user_idTousers: { select: { id: true, name: true, email: true, phone: true } },
        users_refund_requests_processed_byTousers: { select: { name: true, email: true } },
      },
    });
  }

  async findByOrderId(orderId) {
    return await prisma.refund_requests.findFirst({
      where: { order_id: orderId },
    });
  }

  async listByUser(userId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.refund_requests.findMany({
        where: { user_id: userId },
        include: {
          orders: { select: { id: true, total: true, created_at: true } },
        },
        orderBy: { created_at: "desc" },
        take: Number(limit),
        skip: Number(skip),
      }),
      prisma.refund_requests.count({ where: { user_id: userId } }),
    ]);
    return { data, total };
  }

  async listAll({ status, refundType } = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = {
      ...(status && { status }),
      ...(refundType && { refund_type: refundType }),
    };
    const [data, total] = await Promise.all([
      prisma.refund_requests.findMany({
        where,
        include: {
          orders: { select: { id: true, total: true, created_at: true } },
          users_refund_requests_user_idTousers: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { created_at: "desc" },
        take: Number(limit),
        skip: Number(skip),
      }),
      prisma.refund_requests.count({ where }),
    ]);
    return { data, total };
  }

  async update(id, data) {
    return await prisma.refund_requests.update({
      where: { id },
      data: { ...data, updated_at: new Date() },
    });
  }

  async countByStatus() {
    return await prisma.refund_requests.groupBy({
      by: ["status"],
      _count: { status: true },
      _sum: { refund_amount: true },
    });
  }
}

export default new RefundRequestDAO();
