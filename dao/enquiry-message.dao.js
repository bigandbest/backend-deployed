import prisma from '../utils/prisma.js';

class EnquiryMessageDAO {
    async create(data) {
        return await prisma.enquiry_messages.create({ data });
    }

    async getById(id) {
        return await prisma.enquiry_messages.findUnique({
            where: { id }
        });
    }

    async listByEnquiry(enquiryId) {
        return await prisma.enquiry_messages.findMany({
            where: { enquiry_id: enquiryId },
            orderBy: { created_at: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.enquiry_messages.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.enquiry_messages.delete({
            where: { id }
        });
    }

    async markAsRead(id) {
        return await prisma.enquiry_messages.update({
            where: { id },
            data: { is_read: true }
        });
    }

    async markAllAsRead(enquiryId) {
        return await prisma.enquiry_messages.updateMany({
            where: { enquiry_id: enquiryId, is_read: false },
            data: { is_read: true }
        });
    }
}

export default new EnquiryMessageDAO();
