import { PrismaClient } from '@prisma/client';
import SellerDAO from '../dao/seller.dao.js';

const prisma = new PrismaClient();

/**
 * Get pending seller product requests
 */
export const getSellerProductRequests = async (req, res) => {
    try {
        const { status } = req.query; // 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'

        const requests = await prisma.seller_products.findMany({
            where: status ? { status } : {},
            include: {
                product: { select: { name: true, media: true } },
                variant: { select: { title: true, sku: true } },
                seller: {
                    select: {
                        business_name: true,
                        user: { select: { name: true, email: true, phone: true } }
                    }
                },
                warehouse: { select: { name: true, parent_warehouse_id: true } }
            },
            orderBy: { created_at: 'desc' }
        });

        // Map data to match the expected structure
        const mappedRequests = requests.map(req => ({
            ...req,
            seller: {
                business_name: req.seller.business_name,
                name: req.seller.user?.name,
                email: req.seller.user?.email,
                phone: req.seller.user?.phone
            }
        }));

        res.status(200).json({ success: true, data: mappedRequests });
    } catch (error) {
        console.error('getSellerProductRequests error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch seller product requests' });
    }
};

/**
 * Approve seller product request and transfer stock
 */
export const approveSellerProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminSellingPrice } = req.body;

        const sellerProduct = await prisma.seller_products.findUnique({
            where: { id },
            include: { warehouse: true }
        });

        if (!sellerProduct) {
            return res.status(404).json({ success: false, error: 'Seller product request not found' });
        }

        if (sellerProduct.status === 'APPROVED') {
            return res.status(400).json({ success: false, error: 'Request is already approved' });
        }

        let zonalWarehouseId = sellerProduct.warehouse?.parent_warehouse_id;
        let divisionWarehouseId = sellerProduct.warehouse_id;
        const variantId = sellerProduct.variant_id;
        const quantity = sellerProduct.stock_quantity;

        // If warehouse mapping is missing on the product itself, try fetching from seller's allocation
        if (!divisionWarehouseId || !zonalWarehouseId) {
            const allocation = await prisma.warehouse_sellers.findFirst({
                where: { seller_id: sellerProduct.seller_id, is_active: true },
                include: { warehouse: true }
            });

            if (allocation && allocation.warehouse) {
                divisionWarehouseId = allocation.warehouse_id;
                zonalWarehouseId = allocation.warehouse.parent_warehouse_id;
            }
        }

        if (!zonalWarehouseId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot approve: seller is not allocated to a warehouse with a valid zonal mapping. Please check seller warehouse allocation.'
            });
        }

        if (!variantId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot approve: missing product variant ID. This product must have a variant selected.'
            });
        }

        // 1. Update status to APPROVED
        const updatedSellerProduct = await prisma.seller_products.update({
            where: { id },
            data: {
                status: 'APPROVED',
                admin_selling_price: adminSellingPrice || sellerProduct.seller_offer_price
            }
        });

        // 2. Decrement stock from Zonal Warehouse (Admin Stock)
        await prisma.$executeRaw`
            UPDATE inventory 
            SET admin_stock = GREATEST(admin_stock - ${quantity}, 0),
                stock_qty = GREATEST(stock_qty - ${quantity}, 0),
                updated_at = NOW()
            WHERE warehouse_id = ${zonalWarehouseId} 
              AND variant_id = ${variantId}::uuid
        `;

        // 3. Recalculate Seller Stock for Division Warehouse (This uses seller.dao.js function)
        await SellerDAO.recalculateSellerStock(divisionWarehouseId, variantId);

        res.status(200).json({ success: true, message: 'Seller product approved and stock transferred successfully', data: updatedSellerProduct });
    } catch (error) {
        console.error('approveSellerProduct error:', error);
        res.status(500).json({ success: false, error: 'Failed to approve seller product' });
    }
};

/**
 * Reject seller product request
 */
export const rejectSellerProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const updatedSellerProduct = await prisma.seller_products.update({
            where: { id },
            data: { status: 'REJECTED' }
        });

        res.status(200).json({ success: true, message: 'Seller product request rejected', data: updatedSellerProduct });
    } catch (error) {
        console.error('rejectSellerProduct error:', error);
        res.status(500).json({ success: false, error: 'Failed to reject seller product' });
    }
};

/**
 * Get all pending withdrawal requests
 */
export const getWithdrawalRequests = async (req, res) => {
    try {
        const { status } = req.query;

        const withdrawals = await prisma.wallet_transactions.findMany({
            where: {
                transaction_type: 'WITHDRAWAL',
                ...(status ? { status } : {})
            },
            include: {
                users_wallet_transactions_user_idTousers: {
                    select: {
                        name: true,
                        email: true,
                        phone: true,
                        sellers: {
                            select: { business_name: true, bank_account_no: true, bank_ifsc: true, bank_name: true }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: withdrawals.map(w => ({
                ...w,
                user: w.users_wallet_transactions_user_idTousers
            }))
        });
    } catch (error) {
        console.error('getWithdrawalRequests error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch withdrawal requests' });
    }
};

/**
 * Approve or Reject a Withdrawal
 */
export const updateWithdrawalStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body; // status should be 'COMPLETED' or 'FAILED'

        if (!['COMPLETED', 'FAILED'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status. Must be COMPLETED or FAILED' });
        }

        const transaction = await prisma.wallet_transactions.findUnique({ where: { id } });
        if (!transaction) return res.status(404).json({ success: false, error: 'Transaction not found' });

        if (transaction.status !== 'PENDING') {
            return res.status(400).json({ success: false, error: 'Transaction is already processed' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Update transaction status
            const updatedTx = await tx.wallet_transactions.update({
                where: { id },
                data: {
                    status,
                    description: adminNotes ? `Admin: ${adminNotes}` : transaction.description
                }
            });

            // If FAILED, refund the wallet balance
            if (status === 'FAILED') {
                const wallet = await tx.wallets.findUnique({ where: { id: transaction.wallet_id } });
                await tx.wallets.update({
                    where: { id: transaction.wallet_id },
                    data: { balance: { increment: transaction.amount } }
                });

                // create a refund transaction log
                await tx.wallet_transactions.create({
                    data: {
                        wallet_id: wallet.id,
                        user_id: transaction.user_id,
                        transaction_type: 'CREDIT',
                        amount: transaction.amount,
                        balance_before: wallet.balance,
                        balance_after: Number(wallet.balance) + Number(transaction.amount),
                        status: 'COMPLETED',
                        description: `Refund for Failed Withdrawal (${id})`
                    }
                });
            }

            return updatedTx;
        });

        res.status(200).json({ success: true, message: `Withdrawal marked as ${status}`, data: result });
    } catch (error) {
        console.error('updateWithdrawalStatus error:', error);
        res.status(500).json({ success: false, error: 'Failed to update withdrawal status' });
    }
};

/**
 * Get all sellers without a warehouse allocation
 */
export const getUnallocatedSellers = async (req, res) => {
    try {
        const sellers = await prisma.sellers.findMany({
            where: {
                warehouse_sellers: {
                    none: {}
                }
            },
            include: {
                user: {
                    select: {
                        name: true,
                        email: true,
                        phone: true
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        res.status(200).json({ success: true, data: sellers });
    } catch (error) {
        console.error('getUnallocatedSellers error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch unallocated sellers' });
    }
};

/**
 * Get pending seller pincode modification requests
 */
export const getPincodeRequests = async (req, res) => {
    try {
        const { status } = req.query; // 'PENDING', 'APPROVED', 'REJECTED'

        const requests = await prisma.seller_pincode_requests.findMany({
            where: status ? { status } : {},
            include: {
                seller: {
                    select: {
                        business_name: true,
                        pincode: true,
                        user: { select: { name: true, email: true, phone: true } }
                    }
                },
                warehouse: { select: { name: true, type: true } }
            },
            orderBy: { created_at: 'desc' }
        });

        const mappedRequests = requests.map(row => ({
            ...row,
            seller: row.seller ? {
                business_name: row.seller.business_name,
                current_pincode: row.seller.pincode,
                name: row.seller.user?.name || "Unknown",
                email: row.seller.user?.email || "N/A",
                phone: row.seller.user?.phone || "N/A"
            } : {
                business_name: "Deleted Seller",
                current_pincode: "N/A",
                name: "N/A",
                email: "N/A",
                phone: "N/A"
            }
        }));

        res.status(200).json({ success: true, data: mappedRequests });
    } catch (error) {
        console.error('getPincodeRequests error details:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch seller pincode requests: ' + error.message });
    }
};

/**
 * Approve seller pincode request
 */
export const approvePincodeRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await prisma.seller_pincode_requests.findUnique({
            where: { id: parseInt(id) }
        });

        if (!request) {
            return res.status(404).json({ success: false, error: 'Pincode request not found' });
        }

        if (request.status === 'APPROVED') {
            return res.status(400).json({ success: false, error: 'Request is already approved' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Update request status
            const updatedReq = await tx.seller_pincode_requests.update({
                where: { id: parseInt(id) },
                data: { status: 'APPROVED', updated_at: new Date() }
            });

            // Update seller's actual pincode and address
            await tx.sellers.update({
                where: { id: request.seller_id },
                data: {
                    pincode: request.pincode,
                    address: request.address,
                    is_active: true
                }
            });

            return updatedReq;
        });


        res.status(200).json({ success: true, message: 'Pincode request approved successfully', data: result });
    } catch (error) {
        console.error('approvePincodeRequest error:', error);
        res.status(500).json({ success: false, error: 'Failed to approve pincode request' });
    }
};

/**
 * Reject seller pincode request
 */
export const rejectPincodeRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejection_reason } = req.body;

        const updatedReq = await prisma.seller_pincode_requests.update({
            where: { id: parseInt(id) },
            data: {
                status: 'REJECTED',
                rejection_reason: rejection_reason || null
            }
        });

        res.status(200).json({ success: true, message: 'Pincode request rejected', data: updatedReq });
    } catch (error) {
        console.error('rejectPincodeRequest error:', error);
        res.status(500).json({ success: false, error: 'Failed to reject pincode request' });
    }
};

/**
 * Allocate a division warehouse to a seller based on pincode
 */
export const allocateSellerWarehouse = async (req, res) => {
    try {
        const { id } = req.params; // Seller ID
        const { pincode } = req.body;

        if (!pincode) {
            return res.status(400).json({ success: false, error: 'Pincode is required' });
        }

        // 1. Find the seller
        const seller = await prisma.sellers.findUnique({ where: { id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller not found' });

        // 2. Find the division warehouse serving this pincode
        const divisionMapping = await prisma.warehouse_pincodes.findFirst({
            where: {
                pincode: pincode,
                is_active: true
            },
            include: {
                warehouses: {
                    select: {
                        id: true,
                        name: true,
                        type: true
                    }
                }
            }
        });

        if (!divisionMapping || !divisionMapping.warehouses) {
            return res.status(400).json({ success: false, error: `No active division warehouse found for pincode ${pincode}` });
        }

        const warehouseId = divisionMapping.warehouses.id;

        // 3. Create mapping and verify seller
        const result = await prisma.$transaction(async (tx) => {
            // Check if mapping already exists just in case
            const existing = await tx.warehouse_sellers.findUnique({
                where: {
                    warehouse_id_seller_id: { warehouse_id: warehouseId, seller_id: id }
                }
            });

            if (!existing) {
                await tx.warehouse_sellers.create({
                    data: {
                        warehouse_id: warehouseId,
                        seller_id: id,
                        is_active: true
                    }
                });
            }

            // Update seller status to verified
            const updatedSeller = await tx.sellers.update({
                where: { id },
                data: {
                    is_verified: true,
                    approved_at: new Date()
                }
            });

            return { updatedSeller, warehouse: divisionMapping.warehouses };
        });

        res.status(200).json({
            success: true,
            message: `Seller allocated to warehouse: ${divisionMapping.warehouses.name}`,
            data: result
        });
    } catch (error) {
        console.error('allocateSellerWarehouse error:', error);
        res.status(500).json({ success: false, error: 'Failed to allocate warehouse to seller' });
    }
};
