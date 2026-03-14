import prisma from "../config/prisma.js";

class EnquiryDAO {
  async createEnquiry(data) {
    return await prisma.product_enquiries.create({
      data,
    });
  }

  async getEnquiryById(id) {
    return await prisma.product_enquiries.findUnique({
      where: { id },
      include: {
        products: {
          select: { id: true, name: true, media: true },
        },
        enquiry_messages: {
          orderBy: { created_at: "asc" },
        },
        enquiry_bids: {
          orderBy: { created_at: "desc" },
        },
      },
    });
  }

  async updateEnquiry(id, data) {
    return await prisma.product_enquiries.update({
      where: { id },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  }

  async listEnquiries(filters = {}, pagination = {}) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      ...(filters.user_id && { user_id: filters.user_id }),
      ...(filters.status && { status: filters.status }),
      ...(filters.search && {
        OR: [
          { message: { contains: filters.search, mode: "insensitive" } },
          { admin_notes: { contains: filters.search, mode: "insensitive" } },
        ],
      }),
    };

    const [data, count] = await Promise.all([
      prisma.product_enquiries.findMany({
        where,
        skip,
        take: limit,
        include: {
          products: {
            select: { id: true, name: true, media: true },
          },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.product_enquiries.count({ where }),
    ]);

    return { data, count };
  }

  async listAll(filters = {}, pagination = {}) {
    return this.listEnquiries(filters, pagination);
  }

  async addEnquiryMessage(enquiryId, messageData) {
    return await prisma.$transaction(async (tx) => {
      const message = await tx.enquiry_messages.create({
        data: {
          ...messageData,
          enquiry_id: enquiryId,
        },
      });

      await tx.product_enquiries.update({
        where: { id: enquiryId },
        data: { updated_at: new Date() },
      });

      return message;
    });
  }

  async addEnquiryBid(enquiryId, bidData) {
    return await prisma.$transaction(async (tx) => {
      const bid = await tx.enquiry_bids.create({
        data: {
          ...bidData,
          enquiry_id: enquiryId,
        },
      });

      await tx.product_enquiries.update({
        where: { id: enquiryId },
        data: { updated_at: new Date() },
      });

      return bid;
    });
  }

  async getUserInteractions(userId) {
    return await prisma.product_enquiries.findMany({
      where: { user_id: userId },
      include: { products: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    });
  }
}

export default new EnquiryDAO();
