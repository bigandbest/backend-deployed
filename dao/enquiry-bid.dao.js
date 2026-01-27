import prisma from '../config/prisma.js';
import { supabase } from '../config/supabaseClient.js';

class EnquiryBidDAO {
    async create(data) {
        return await prisma.enquiry_bids.create({ data });
    }

    async getById(id) {
        return await prisma.enquiry_bids.findUnique({
            where: { id: parseInt(id) },
            include: { enquiry: true }
        });
    }

    async listByEnquiry(enquiryId) {
        return await prisma.enquiry_bids.findMany({
            where: { enquiry_id: parseInt(enquiryId) },
            orderBy: { created_at: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.enquiry_bids.update({
            where: { id: parseInt(id) },
            data
        });
    }

    async delete(id) {
        return await prisma.enquiry_bids.delete({
            where: { id: parseInt(id) }
        });
    }

    async updateStatus(id, status) {
        return await prisma.enquiry_bids.update({
            where: { id: parseInt(id) },
            data: { status }
        });
    }

    async calculateGST(bidId) {
        const { data, error } = await supabase.rpc(
            "calculate_bid_gst",
            { p_bid_id: parseInt(bidId) }
        );

        if (error) throw error;
        return data;
    }
}

export default new EnquiryBidDAO();
