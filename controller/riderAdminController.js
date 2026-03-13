import prisma from '../config/prisma.js';

// ============ GET PENDING RIDERS ============
export const getPendingRiders = async (req, res) => {
    try {
        const { status } = req.query;
        const filterStatus = status || 'PENDING_VERIFICATION';

        const riders = await prisma.riders.findMany({
            where: { verification_status: filterStatus },
            include: {
                user: { select: { id: true, email: true, name: true, phone: true } },
                rider_documents: true,
            },
            orderBy: { created_at: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: riders.map(r => ({
                rider_id: r.id,
                user_id: r.user_id,
                name: r.user.name,
                email: r.user.email,
                phone: r.user.phone,
                vehicle_type: r.vehicle_type,
                vehicle_number: r.vehicle_number,
                verification_status: r.verification_status,
                documents: r.rider_documents.map(d => ({
                    id: d.id,
                    type: d.document_type,
                    url: d.document_url,
                    status: d.status,
                    rejection_reason: d.rejection_reason,
                })),
                created_at: r.created_at,
            })),
        });
    } catch (error) {
        console.error('Get pending riders error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch riders' });
    }
};

// ============ REVIEW DOCUMENT ============
export const reviewDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, rejection_reason } = req.body; // action: 'APPROVE' or 'REJECT'

        if (!['APPROVE', 'REJECT'].includes(action)) {
            return res.status(400).json({ success: false, error: 'action must be APPROVE or REJECT' });
        }

        const doc = await prisma.rider_documents.findUnique({
            where: { id },
            include: { riders: true }
        });

        if (!doc) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        if (action === 'REJECT' && !rejection_reason) {
            return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting' });
        }

        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        // Update document
        const updated = await prisma.rider_documents.update({
            where: { id },
            data: {
                status: newStatus,
                rejection_reason: action === 'REJECT' ? rejection_reason : null,
                reviewed_by: req.user.id,
                reviewed_at: new Date(),
                updated_at: new Date(),
            }
        });

        // After review, re-evaluate rider verification status
        const allDocs = await prisma.rider_documents.findMany({ where: { rider_id: doc.rider_id } });
        const hasRejected = allDocs.some(d => d.status === 'REJECTED');
        const hasPending = allDocs.some(d => d.status === 'PENDING');
        const allApproved = allDocs.length >= 3 && allDocs.every(d => d.status === 'APPROVED');

        let newVerificationStatus = doc.riders.verification_status;
        if (hasRejected) {
            newVerificationStatus = 'ACTION_REQUIRED';
        } else if (allApproved) {
            newVerificationStatus = 'VERIFIED';
        } else if (hasPending) {
            newVerificationStatus = 'PENDING_VERIFICATION';
        }

        await prisma.riders.update({
            where: { id: doc.rider_id },
            data: {
                verification_status: newVerificationStatus,
                is_verified: allApproved,
                ...(allApproved ? { approved_at: new Date(), approved_by: req.user.id } : {}),
                updated_at: new Date(),
            }
        });

        res.status(200).json({
            success: true,
            data: {
                document_id: updated.id,
                status: updated.status,
                rider_verification_status: newVerificationStatus,
            },
            message: `Document ${action.toLowerCase()}d successfully`,
        });
    } catch (error) {
        console.error('Review document error:', error);
        res.status(500).json({ success: false, error: 'Failed to review document' });
    }
};

// ============ ALLOCATE RIDER TO WAREHOUSE ============
export const allocateRiderWarehouse = async (req, res) => {
    try {
        const { riderId } = req.params;
        const { warehouse_id } = req.body;

        if (!warehouse_id) {
            return res.status(400).json({ success: false, error: 'warehouse_id is required' });
        }

        const rider = await prisma.riders.findUnique({ where: { id: riderId } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider not found' });

        if (rider.verification_status !== 'VERIFIED') {
            return res.status(400).json({ success: false, error: 'Rider must be VERIFIED before warehouse allocation' });
        }

        // Verify warehouse exists and is a division warehouse
        const warehouse = await prisma.warehouses.findUnique({ where: { id: warehouse_id } });
        if (!warehouse) return res.status(404).json({ success: false, error: 'Warehouse not found' });
        if (!warehouse.parent_warehouse_id) {
            return res.status(400).json({ success: false, error: 'Rider can only be assigned to a Division warehouse (child)' });
        }

        // Deactivate old allocations
        await prisma.warehouse_riders.updateMany({
            where: { rider_id: riderId, is_active: true },
            data: { is_active: false }
        });

        // Create new allocation
        const allocation = await prisma.warehouse_riders.create({
            data: {
                warehouse_id,
                rider_id: riderId,
                is_active: true,
            }
        });

        res.status(200).json({
            success: true,
            data: allocation,
            message: 'Rider allocated to warehouse successfully',
        });
    } catch (error) {
        console.error('Allocate rider warehouse error:', error);
        res.status(500).json({ success: false, error: 'Failed to allocate warehouse' });
    }
};

// ============ REASSIGN RIDER WAREHOUSE ============
export const reassignRiderWarehouse = async (req, res) => {
    try {
        const { riderId } = req.params;
        const { new_warehouse_id } = req.body;

        if (!new_warehouse_id) {
            return res.status(400).json({ success: false, error: 'new_warehouse_id is required' });
        }

        // Check for pending/active orders from old division
        const rider = await prisma.riders.findUnique({
            where: { id: riderId },
            include: {
                warehouse_riders: { where: { is_active: true }, include: { warehouse: true } }
            }
        });

        if (!rider) return res.status(404).json({ success: false, error: 'Rider not found' });

        // Check if rider has active (non-delivered) orders
        const activeOrders = await prisma.orders.findMany({
            where: {
                rider_id: riderId,
                status: { notIn: ['Delivered', 'Cancelled', 'Returned'] }
            }
        });

        if (activeOrders.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Rider has ${activeOrders.length} active order(s). They must complete or be reassigned before warehouse transfer.`,
                active_orders: activeOrders.map(o => o.id),
            });
        }

        // Deactivate old, create new
        await prisma.warehouse_riders.updateMany({
            where: { rider_id: riderId, is_active: true },
            data: { is_active: false }
        });

        const allocation = await prisma.warehouse_riders.create({
            data: {
                warehouse_id: new_warehouse_id,
                rider_id: riderId,
                is_active: true,
            }
        });

        res.status(200).json({
            success: true,
            data: allocation,
            message: 'Rider reassigned to new warehouse successfully',
        });
    } catch (error) {
        console.error('Reassign rider warehouse error:', error);
        res.status(500).json({ success: false, error: 'Failed to reassign warehouse' });
    }
};

// ============ GET PENDING SELLERS ============
export const getPendingSellers = async (req, res) => {
    try {
        const { status } = req.query;
        const filterStatus = status || 'PENDING_VERIFICATION';

        const sellers = await prisma.sellers.findMany({
            where: { verification_status: filterStatus },
            include: {
                users: { select: { id: true, email: true, name: true, phone: true } },
                seller_documents: true,
            },
            orderBy: { created_at: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: sellers.map(s => ({
                seller_id: s.id,
                user_id: s.user_id,
                name: s.users.name,
                email: s.users.email,
                phone: s.users.phone,
                business_name: s.business_name,
                business_type: s.business_type,
                verification_status: s.verification_status,
                documents: s.seller_documents.map(d => ({
                    id: d.id,
                    type: d.document_type,
                    url: d.document_url,
                    status: d.status,
                    rejection_reason: d.rejection_reason,
                })),
                created_at: s.created_at,
            })),
        });
    } catch (error) {
        console.error('Get pending sellers error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch sellers' });
    }
};

// ============ REVIEW SELLER DOCUMENT ============
export const reviewSellerDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, rejection_reason } = req.body;

        if (!['APPROVE', 'REJECT'].includes(action)) {
            return res.status(400).json({ success: false, error: 'action must be APPROVE or REJECT' });
        }

        const doc = await prisma.seller_documents.findUnique({
            where: { id },
            include: { sellers: true }
        });

        if (!doc) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        if (action === 'REJECT' && !rejection_reason) {
            return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting' });
        }

        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        const updated = await prisma.seller_documents.update({
            where: { id },
            data: {
                status: newStatus,
                rejection_reason: action === 'REJECT' ? rejection_reason : null,
                reviewed_by: req.user.id,
                reviewed_at: new Date(),
                updated_at: new Date(),
            }
        });

        // Re-evaluate seller verification status
        const allDocs = await prisma.seller_documents.findMany({ where: { seller_id: doc.seller_id } });
        const hasRejected = allDocs.some(d => d.status === 'REJECTED');
        const hasPending = allDocs.some(d => d.status === 'PENDING');
        const allApproved = allDocs.length >= 3 && allDocs.every(d => d.status === 'APPROVED');

        let newVerificationStatus = doc.sellers.verification_status;
        if (hasRejected) {
            newVerificationStatus = 'ACTION_REQUIRED';
        } else if (allApproved) {
            newVerificationStatus = 'VERIFIED';
        } else if (hasPending) {
            newVerificationStatus = 'PENDING_VERIFICATION';
        }

        await prisma.sellers.update({
            where: { id: doc.seller_id },
            data: {
                verification_status: newVerificationStatus,
                is_verified: allApproved,
                ...(allApproved ? { approved_at: new Date(), approved_by: req.user.id } : {}),
                updated_at: new Date(),
            }
        });

        res.status(200).json({
            success: true,
            data: {
                document_id: updated.id,
                status: updated.status,
                seller_verification_status: newVerificationStatus,
            },
            message: `Document ${action.toLowerCase()}d successfully`,
        });
    } catch (error) {
        console.error('Review seller document error:', error);
        res.status(500).json({ success: false, error: 'Failed to review document' });
    }
};

// ============ GET ALL VERIFICATION REQUESTS ============
export const getAllVerificationRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const filterStatus = status || 'PENDING_VERIFICATION';

        const [riders, sellers] = await Promise.all([
            prisma.riders.findMany({
                where: { verification_status: filterStatus },
                include: {
                    users: { select: { id: true, email: true, name: true, phone: true } },
                    rider_documents: true,
                },
                orderBy: { created_at: 'desc' }
            }),
            prisma.sellers.findMany({
                where: { verification_status: filterStatus },
                include: {
                    users: { select: { id: true, email: true, name: true, phone: true } },
                    seller_documents: true,
                },
                orderBy: { created_at: 'desc' }
            })
        ]);

        res.status(200).json({
            success: true,
            data: {
                riders: riders.map(r => ({
                    type: 'RIDER',
                    rider_id: r.id,
                    user_id: r.user_id,
                    name: r.users.name,
                    email: r.users.email,
                    phone: r.users.phone,
                    vehicle_type: r.vehicle_type,
                    vehicle_number: r.vehicle_number,
                    verification_status: r.verification_status,
                    documents: r.rider_documents.map(d => ({
                        id: d.id,
                        type: d.document_type,
                        url: d.document_url,
                        status: d.status,
                        rejection_reason: d.rejection_reason,
                    })),
                    created_at: r.created_at,
                })),
                sellers: sellers.map(s => ({
                    type: 'SELLER',
                    seller_id: s.id,
                    user_id: s.user_id,
                    name: s.users.name,
                    email: s.users.email,
                    phone: s.users.phone,
                    business_name: s.business_name,
                    business_type: s.business_type,
                    verification_status: s.verification_status,
                    documents: s.seller_documents.map(d => ({
                        id: d.id,
                        type: d.document_type,
                        url: d.document_url,
                        status: d.status,
                        rejection_reason: d.rejection_reason,
                    })),
                    created_at: s.created_at,
                })),
            },
        });
    } catch (error) {
        console.error('Get all verification requests error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch verification requests' });
    }
};
