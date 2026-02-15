import prisma from "../config/prisma.js";

const businessPartnerInquiryDao = {
  // Create a new business partner inquiry
  async create(data) {
    return await prisma.business_partner_inquiries.create({
      data: {
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        city: data.city,
        state: data.state,
        partnership_type: data.partnership_type,
        message: data.message,
        status: data.status || "Pending",
      },
    });
  },

  // List all inquiries with optional filters
  async list(filters = {}) {
    const where = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.partnership_type) {
      where.partnership_type = filters.partnership_type;
    }

    return await prisma.business_partner_inquiries.findMany({
      where,
      orderBy: {
        created_at: "desc",
      },
    });
  },

  // Find inquiry by ID
  async findById(id) {
    return await prisma.business_partner_inquiries.findUnique({
      where: { id },
    });
  },

  // Update inquiry
  async update(id, data) {
    return await prisma.business_partner_inquiries.update({
      where: { id },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  },

  // Delete inquiry
  async delete(id) {
    return await prisma.business_partner_inquiries.delete({
      where: { id },
    });
  },

  // Get inquiry count by status
  async getCountByStatus() {
    const inquiries = await prisma.business_partner_inquiries.groupBy({
      by: ["status"],
      _count: {
        id: true,
      },
    });

    return inquiries.reduce((acc, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {});
  },
};

export default businessPartnerInquiryDao;
