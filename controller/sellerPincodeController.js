import sellerPincodeDao from '../dao/sellerPincode.dao.js';
import prisma from '../config/prisma.js';

export const requestPincode = async (req, res) => {
    try {
        const { pincode, address } = req.body;
        let sellerId = req.user.seller_id;

        if (!sellerId) {
            const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
            if (!seller) return res.status(404).json({ success: false, message: 'Seller profile not found' });
            sellerId = seller.id;
        }

        if (!pincode || !address) {
            return res.status(400).json({ success: false, message: 'Pincode and address are required' });
        }

        // Check if there is already a pending request
        const existingRequests = await sellerPincodeDao.getRequestsBySeller(sellerId);
        const hasPending = existingRequests.some(r => r.status === 'PENDING');
        if (hasPending) {
            return res.status(400).json({ success: false, message: 'You already have a pending pincode request.' });
        }

        const newRequest = await sellerPincodeDao.createRequest(sellerId, pincode, address);

        return res.status(201).json({
            success: true,
            message: 'Pincode request submitted successfully. Awaiting Admin approval.',
            data: newRequest
        });
    } catch (error) {
        console.error("Error requesting pincode:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const getMyRequests = async (req, res) => {
    try {
        let sellerId = req.user.seller_id;

        if (!sellerId) {
            const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
            if (!seller) return res.status(404).json({ success: false, message: 'Seller profile not found' });
            sellerId = seller.id;
        }

        const requests = await sellerPincodeDao.getRequestsBySeller(sellerId);
        return res.status(200).json({ success: true, data: requests });
    } catch (error) {
        console.error("Error fetching pincode requests:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Admin Methods
export const getPendingRequests = async (req, res) => {
    try {
        const requests = await sellerPincodeDao.getPendingRequests();
        return res.status(200).json({ success: true, data: requests });
    } catch (error) {
        console.error("Error fetching pending requests:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const approveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await sellerPincodeDao.getRequestById(id);

        if (!request || request.status !== 'PENDING') {
            return res.status(404).json({ success: false, message: 'Pending request not found' });
        }

        const sellerId = request.seller_id;
        const pincode = request.pincode;
        const address = request.address;

        // Find a division warehouse covering this pincode
        const warehouseCoverage = await prisma.warehouse_pincodes.findFirst({
            where: { pincode: pincode, is_active: true },
            include: { warehouse: true }
        });

        if (!warehouseCoverage) {
            return res.status(400).json({
                success: false,
                message: `No active warehouse serves pincode: ${pincode}`
            });
        }

        const warehouseId = warehouseCoverage.warehouse_id;

        // Transaction: Approve request, link warehouse to seller, update seller record
        await prisma.$transaction(async (tx) => {
            // 1. Approve Request
            await tx.seller_pincode_requests.update({
                where: { id: parseInt(id) },
                data: { status: 'APPROVED', updated_at: new Date() }
            });

            // 2. Link Seller to Warehouse (upsert to handle if it already exists)
            await tx.warehouse_sellers.upsert({
                where: { warehouse_id_seller_id: { warehouse_id: warehouseId, seller_id: sellerId } },
                update: { is_active: true },
                create: { warehouse_id: warehouseId, seller_id: sellerId, is_active: true }
            });

            // 3. Update Seller Details
            await tx.sellers.update({
                where: { id: sellerId },
                data: { pincode: pincode, address: address, is_active: true }
            });
        });

        return res.status(200).json({
            success: true,
            message: `Request approved. Seller assigned to warehouse: ${warehouseCoverage.warehouse?.name}`
        });

    } catch (error) {
        console.error("Error approving pincode request:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await sellerPincodeDao.updateRequestStatus(id, 'REJECTED');
        return res.status(200).json({ success: true, message: 'Request rejected', data: updated });
    } catch (error) {
        console.error("Error rejecting pincode request:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
