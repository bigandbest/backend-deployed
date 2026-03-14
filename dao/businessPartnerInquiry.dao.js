import prisma from "../config/prisma.js";

const businessPartnerInquiryDao = {
  // Create a new business partner inquiry
  async create(data) {
    // Store business partner inquiries in the generic `enquiries` table
    // with type = 'business_partner' and subject = partnership_type.
    return await prisma.enquiries.create({
      data: {
        name: data.full_name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        partnership_type: data.partnership_type,
        message: data.message,
        status: data.status || "pending",
        type: "business_partner",
        subject: data.partnership_type || "Business Partnership",
      },
    });
  },

  // List all inquiries with optional filters
  async list(filters = {}) {
    const where = {
      type: "business_partner",
    };

    if (filters.status) {
      where.status = filters.status;
    }

    // Prefer the dedicated partnership_type field; fall back to subject for backwards compatibility.
    if (filters.partnership_type) {
      where.OR = [
        { partnership_type: filters.partnership_type },
        { subject: filters.partnership_type },
      ];
    }

    return await prisma.enquiries.findMany({
      where,
      orderBy: {
        created_at: "desc",
      },
    });
  },

  // Find inquiry by ID
  async findById(id) {
    return await prisma.enquiries.findUnique({
      where: { id },
    });
  },

  // Update inquiry
  async update(id, data) {
    return await prisma.enquiries.update({
      where: { id },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  },

  // Delete inquiry
  async delete(id) {
    return await prisma.enquiries.delete({
      where: { id },
    });
  },

  // Get inquiry count by status
  async getCountByStatus() {
    const inquiries = await prisma.enquiries.groupBy({
      by: ["status"],
      where: {
        type: "business_partner",
      },
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
