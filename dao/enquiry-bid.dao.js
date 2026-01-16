import prisma from '../utils/prisma.js';

class EnquiryBidDAO {
    async create(data) {
        return await prisma.enquiry_bids.create({ data });
    }

    async getById(id) {
        return await prisma.enquiry_bids.findUnique({
            where: { id },
            include: { enquiry: true }
        });
    }

    async listByEnquiry(enquiryId) {
        return await prisma.enquiry_bids.findMany({
            where: { enquiry_id: enquiryId },
            orderBy: { created_at: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.enquiry_bids.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.enquiry_bids.delete({
            where: { id }
        });
    }

    async updateStatus(id, status) {
        return await prisma.enquiry_bids.update({
            where: { id },
            data: { status }
        });
    }
}

export default new EnquiryBidDAO();
