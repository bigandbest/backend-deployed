import prisma from '../utils/prisma.js';

class EnquiryDAO {
    async createEnquiry(data) {
        return await prisma.product_enquiries.create({
            data
        });
    }

    async getEnquiryById(id) {
        return await prisma.product_enquiries.findUnique({
            where: { id },
            include: {
                product: true,
                messages: {
                    orderBy: { created_at: 'asc' }
                },
                bids: {
                    orderBy: { created_at: 'desc' }
                }
            }
        });
    }

    async updateEnquiry(id, data) {
        return await prisma.product_enquiries.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async listEnquiries(filters = {}, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        return await prisma.product_enquiries.findMany({
            where: filters,
            skip,
            take: limit,
            include: {
                product: {
                    select: { name: true, image: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    async addEnquiryMessage(enquiryId, messageData) {
        return await prisma.$transaction(async (tx) => {
            const message = await tx.enquiry_messages.create({
                data: {
                    ...messageData,
                    enquiry_id: enquiryId
                }
            });

            await tx.product_enquiries.update({
                where: { id: enquiryId },
                data: { updated_at: new Date() }
            });

            return message;
        });
    }

    async addEnquiryBid(enquiryId, bidData) {
        return await prisma.$transaction(async (tx) => {
            const bid = await tx.enquiry_bids.create({
                data: {
                    ...bidData,
                    enquiry_id: enquiryId
                }
            });

            await tx.product_enquiries.update({
                where: { id: enquiryId },
                data: { updated_at: new Date() }
            });

            return bid;
        });
    }

    async getUserInteractions(userId) {
        return await prisma.product_enquiries.findMany({
            where: { user_id: userId },
            include: { product: { select: { name: true } } },
            orderBy: { created_at: 'desc' }
        });
    }
}

export default new EnquiryDAO();
