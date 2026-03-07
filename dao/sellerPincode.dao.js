import prisma from '../config/prisma.js';

class SellerPincodeDAO {
    /**
     * Create a new pincode request for a seller
     */
    async createRequest(sellerId, pincode, address) {
        return await prisma.seller_pincode_requests.create({
            data: {
                seller_id: sellerId,
                pincode: pincode.trim(),
                address,
                status: 'PENDING'
            }
        });
    }

    /**
     * Get all pincode requests for a seller
     */
    async getRequestsBySeller(sellerId) {
        return await prisma.seller_pincode_requests.findMany({
            where: { seller_id: sellerId },
            orderBy: { created_at: 'desc' }
        });
    }

    /**
     * Get pending requests for Admin
     */
    async getPendingRequests() {
        return await prisma.seller_pincode_requests.findMany({
            where: { status: 'PENDING' },
            include: {
                seller: {
                    select: { business_name: true, user: { select: { email: true, phone: true } } }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    /**
     * Update request status
     */
    async updateRequestStatus(requestId, status) {
        return await prisma.seller_pincode_requests.update({
            where: { id: parseInt(requestId) },
            data: { status, updated_at: new Date() },
            include: { seller: true }
        });
    }

    /**
     * Get a single request
     */
    async getRequestById(requestId) {
        return await prisma.seller_pincode_requests.findUnique({
            where: { id: parseInt(requestId) },
            include: { seller: true }
        });
    }
}

export default new SellerPincodeDAO();
