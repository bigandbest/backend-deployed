import SellerDAO from '../dao/seller.dao.js';
import prisma from '../config/prisma.js';

/**
 * Get seller's products
 */
export const getSellerProducts = async (req, res) => {
    try {
        const sellerId = req.user.seller_id;
        if (!sellerId) {
            // Lookup seller_id from user
            const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
            if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });
            req.user.seller_id = seller.id;
        }

        const products = await SellerDAO.getSellerProducts(req.user.seller_id, req.query);

        res.status(200).json({
            success: true,
            data: products.map(sp => ({
                id: sp.id,
                product_id: sp.product_id,
                product_name: sp.product?.name,
                product_image: sp.product?.media?.[0]?.url || null,
                category: sp.product?.category?.name,
                variant_id: sp.variant_id,
                variant_name: sp.variant?.title,
                warehouse_id: sp.warehouse_id,
                warehouse_name: sp.warehouse?.name,
                stock_quantity: sp.stock_quantity,
                seller_offer_price: sp.seller_offer_price,
                admin_selling_price: sp.admin_selling_price,
                mrp: sp.mrp,
                status: sp.status,
                sku: sp.variant?.sku || '',
                created_at: sp.created_at,
            })),
            count: products.length,
        });
    } catch (error) {
        console.error('getSellerProducts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Search master product catalog
 */
export const searchMasterProducts = async (req, res) => {
    try {
        const { q, categoryId } = req.query;

        const where = { active: true };

        if (q) {
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
            ];
        }

        if (categoryId) {
            where.category_id = categoryId;
        }

        const products = await prisma.products.findMany({
            where,
            include: {
                media: { take: 1 },
                variants: { where: { active: true } },
                category: { select: { id: true, name: true } },
            },
            take: 40, // Increased limit for global catalog
            orderBy: { created_at: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: products.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                imageUrl: p.media?.[0]?.url || null,
                category: p.category?.name,
                basePrice: p.variants?.[0]?.price || 0,
                sku: p.variants?.[0]?.sku || '',
                variants: p.variants?.map(v => ({
                    id: v.id,
                    title: v.title,
                    price: v.price,
                    sku: v.sku,
                })),
            })),
        });
    } catch (error) {
        console.error('searchMasterProducts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Request new product addition
 */
export const requestNewProduct = async (req, res) => {
    try {
        const { name, description, photo_url, category_id } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Product name is required' });
        }

        // Get seller profile
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        // Create product request (as inactive product pending admin approval)
        const product = await prisma.products.create({
            data: {
                name,
                description,
                created_by: 'seller',
                seller_id: seller.id,
                active: false, // Admin will activate after review
                category_id: category_id || null,
            }
        });

        // Add photo if provided
        if (photo_url) {
            await prisma.product_media.create({
                data: {
                    product_id: product.id,
                    url: photo_url,
                    media_type: 'image',
                    display_order: 0,
                }
            });
        }

        res.status(201).json({
            success: true,
            data: { id: product.id, name: product.name },
            message: 'Product request submitted. Admin will review and assign a product code.',
        });
    } catch (error) {
        console.error('requestNewProduct error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Add product stock (with offer price)
 */
export const addProductStock = async (req, res) => {
    try {
        const { product_id, variant_id, stock_quantity, offer_price, mrp } = req.body;

        if (!product_id || stock_quantity === undefined || !offer_price) {
            return res.status(400).json({
                success: false,
                error: 'product_id, stock_quantity, and offer_price are required'
            });
        }

        // Get seller profile and their assigned warehouse(s)
        const seller = await prisma.sellers.findUnique({
            where: { user_id: req.user.id },
            include: { warehouse_sellers: true }
        });

        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        if (!seller.warehouse_sellers || seller.warehouse_sellers.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'You are not assigned to any warehouse. Please wait for admin allocation.'
            });
        }

        // Use the seller's primary assigned warehouse
        const assignedWarehouseId = seller.warehouse_sellers[0].warehouse_id;

        const result = await SellerDAO.upsertSellerProduct({
            seller_id: seller.id,
            product_id,
            variant_id: variant_id || null,
            warehouse_id: assignedWarehouseId,
            stock_quantity,
            seller_offer_price: offer_price,
            mrp,
        });

        res.status(201).json({
            success: true,
            data: result,
            message: 'Stock added. Pending admin approval for pricing.',
        });
    } catch (error) {
        console.error('addProductStock error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Update offer price for a product
 */
export const updateOfferPrice = async (req, res) => {
    try {
        const { id } = req.params;
        const { offerPrice } = req.body;

        if (!offerPrice) {
            return res.status(400).json({ success: false, error: 'offerPrice is required' });
        }

        // Verify ownership
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const sellerProduct = await prisma.seller_products.findUnique({ where: { id } });
        if (!sellerProduct || sellerProduct.seller_id !== seller.id) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        const result = await SellerDAO.updateOfferPrice(id, offerPrice);
        res.status(200).json({ success: true, data: result, message: 'Offer price updated. Pending admin review.' });
    } catch (error) {
        console.error('updateOfferPrice error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get negotiations
 */
export const getNegotiations = async (req, res) => {
    try {
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const { status } = req.query;
        const negotiations = await SellerDAO.getNegotiations(seller.id, status);

        res.status(200).json({
            success: true,
            data: negotiations.map(n => ({
                id: n.id,
                product_id: n.product_id,
                product_name: n.product?.name,
                product_image: n.product?.media?.[0]?.url || null,
                proposed_quantity: n.proposed_quantity,
                seller_proposed_price: n.seller_proposed_price,
                admin_counter_price: n.admin_counter_price,
                final_agreed_price: n.final_agreed_price,
                status: n.status,
                seller_notes: n.seller_notes,
                admin_notes: n.admin_notes,
                created_at: n.created_at,
                updated_at: n.updated_at,
            })),
        });
    } catch (error) {
        console.error('getNegotiations error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Accept counter offer
 */
export const acceptCounterOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const result = await SellerDAO.acceptCounterOffer(id, seller.id);
        res.status(200).json({ success: true, data: result, message: 'Counter offer accepted' });
    } catch (error) {
        console.error('acceptCounterOffer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};

/**
 * Decline counter offer
 */
export const declineCounterOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const { newOfferPrice } = req.body;
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const result = await SellerDAO.declineCounterOffer(id, seller.id, newOfferPrice);
        res.status(200).json({ success: true, data: result, message: newOfferPrice ? 'New offer submitted' : 'Counter offer declined' });
    } catch (error) {
        console.error('declineCounterOffer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};

/**
 * Get seller orders
 */
export const getSellerOrders = async (req, res) => {
    try {
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const orders = await SellerDAO.getSellerOrders(seller.id, req.query);

        res.status(200).json({
            success: true,
            data: orders.map(o => ({
                id: o.id,
                order_number: o.order_number,
                status: o.status,
                total_amount: o.total_amount,
                customer_name: o.user?.name,
                items: o.order_items?.map(oi => ({
                    product_name: oi.product?.name,
                    variant_name: oi.variant?.title,
                    quantity: oi.quantity,
                    price: oi.price,
                })),
                created_at: o.created_at,
            })),
        });
    } catch (error) {
        console.error('getSellerOrders error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get order details
 */
export const getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                order_items: {
                    include: {
                        product: true,
                        variant: true,
                    }
                },
                user: {
                    select: { id: true, name: true, email: true, phone: true }
                }
            }
        });

        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        console.error('getOrderDetails error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get seller dashboard stats
 */
export const getSellerDashboard = async (req, res) => {
    try {
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const stats = await SellerDAO.getDashboardStats(seller.id);

        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        console.error('getSellerDashboard error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get seller earnings
 */
export const getSellerEarnings = async (req, res) => {
    try {
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const { period } = req.query;
        const earnings = await SellerDAO.getEarnings(seller.id, period || 'month');

        res.status(200).json({ success: true, data: earnings });
    } catch (error) {
        console.error('getSellerEarnings error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Request Wallet Withdrawal
 */
export const requestWalletWithdrawal = async (req, res) => {
    try {
        const { amount } = req.body;
        const withdrawAmount = parseFloat(amount);

        if (!amount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Valid positive amount is required' });
        }

        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        if (!seller.bank_account_no || !seller.bank_ifsc) {
            return res.status(400).json({ success: false, error: 'Bank details must be updated before requesting a withdrawal' });
        }

        const wallet = await prisma.wallets.findUnique({ where: { user_id: req.user.id } });
        if (!wallet) return res.status(404).json({ success: false, error: 'Wallet not found' });

        if (parseFloat(wallet.balance) < withdrawAmount) {
            return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
        }

        // Use a transaction to deduct balance and create the PENDING withdrawal request mapping
        const result = await prisma.$transaction(async (tx) => {
            const updatedWallet = await tx.wallets.update({
                where: { id: wallet.id },
                data: { balance: { decrement: withdrawAmount } },
            });

            const transaction = await tx.wallet_transactions.create({
                data: {
                    wallet_id: wallet.id,
                    user_id: req.user.id,
                    transaction_type: 'WITHDRAWAL',
                    amount: withdrawAmount,
                    balance_before: wallet.balance,
                    balance_after: updatedWallet.balance,
                    status: 'PENDING',
                    description: 'Withdrawal to Bank Account'
                },
            });
            return { updatedWallet, transaction };
        });

        res.status(200).json({ success: true, message: 'Withdrawal requested successfully', data: result.transaction });
    } catch (error) {
        console.error('Request withdrawal error:', error);
        res.status(500).json({ success: false, error: 'Failed to process withdrawal request' });
    }
};

/**
 * Get all active division warehouses
 */
export const getDivisionWarehouses = async (req, res) => {
    try {
        const warehouses = await prisma.warehouses.findMany({
            where: { is_active: true, type: 'division' },
            select: { id: true, name: true, location: true, address: true }
        });
        res.json({ success: true, data: warehouses });
    } catch (error) {
        console.error('getDivisionWarehouses error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch division warehouses' });
    }
};

/**
 * Get all pincodes covered by a specific division warehouse
 */
export const getWarehousePincodes = async (req, res) => {
    try {
        const warehouseId = parseInt(req.params.warehouseId);
        if (isNaN(warehouseId)) {
            return res.status(400).json({ success: false, error: 'Invalid warehouse ID format' });
        }

        const pincodes = await prisma.warehouse_pincodes.findMany({
            where: { warehouse_id: warehouseId, is_active: true },
            select: { pincode: true, is_active: true }
        });
        res.json({ success: true, data: pincodes });
    } catch (error) {
        console.error('getWarehousePincodes error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch warehouse pincodes' });
    }
};

/**
 * Allocate a division warehouse and pincodes for a seller.
 * This can only be done once by the seller.
 */
export const allocateWarehouse = async (req, res) => {
    try {
        const { warehouse_id, pincodes } = req.body;
        const sellerId = req.user.id;

        if (!warehouse_id || !pincodes || !Array.isArray(pincodes) || pincodes.length === 0) {
            return res.status(400).json({ success: false, error: 'warehouse_id and a list of pincodes are required' });
        }

        const warehouseIdInt = parseInt(warehouse_id);

        const sellerUser = await prisma.users.findUnique({
            where: { id: sellerId },
            include: { seller_profile: true }
        });

        if (!sellerUser || !sellerUser.seller_profile) {
            return res.status(404).json({ success: false, error: 'Seller profile not found' });
        }

        const sellerRecord = sellerUser.seller_profile;

        // Check if seller already has a warehouse allocated
        const existingAllocation = await prisma.warehouse_sellers.findFirst({
            where: { seller_id: sellerRecord.id }
        });

        if (existingAllocation && existingAllocation.warehouse_id !== warehouseIdInt) {
            return res.status(400).json({ success: false, error: 'A different warehouse is already allocated. Cannot change division.' });
        }

        // Verify warehouse exists and is division
        const warehouse = await prisma.warehouses.findUnique({
            where: { id: warehouseIdInt }
        });

        if (!warehouse || warehouse.type !== 'division' || !warehouse.is_active) {
            return res.status(400).json({ success: false, error: 'Invalid or inactive division warehouse selected' });
        }

        // Verify all provided pincodes are valid for that warehouse
        const validPincodeRecords = await prisma.warehouse_pincodes.findMany({
            where: {
                warehouse_id: warehouseIdInt,
                pincode: { in: pincodes },
                is_active: true
            }
        });

        const validPincodeStrs = validPincodeRecords.map(p => p.pincode);
        const invalidPincodes = pincodes.filter(p => !validPincodeStrs.includes(p));

        if (invalidPincodes.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Some selected pincodes are not mapped to this warehouse: ${invalidPincodes.join(', ')}`
            });
        }

        // Start transaction to map seller to warehouse and update seller pincodes
        await prisma.$transaction(async (tx) => {
            if (!existingAllocation) {
                // Create mapping
                await tx.warehouse_sellers.create({
                    data: {
                        warehouse_id: warehouseIdInt,
                        seller_id: sellerRecord.id,
                        is_active: true
                    }
                });
            }

            // Wait, we need to create a request, not update directly unless it's a first time allocation.
            if (!existingAllocation) {
                // First time allocation: immediately save pincodes and create mapping
                await tx.sellers.update({
                    where: { id: sellerRecord.id },
                    data: {
                        pincode: pincodes.join(',')
                    }
                });
            } else {
                // Determine if pincodes changed
                const currentPincodes = sellerRecord.pincode ? sellerRecord.pincode.split(',').map(p => p.trim()) : [];
                const newPincodesStr = pincodes.join(',');

                if (sellerRecord.pincode !== newPincodesStr) {
                    // Check if pending request already exists
                    const pendingRequest = await tx.seller_pincode_requests.findFirst({
                        where: { seller_id: sellerRecord.id, status: 'PENDING' }
                    });

                    if (pendingRequest) {
                        // update existing pending request
                        await tx.seller_pincode_requests.update({
                            where: { id: pendingRequest.id },
                            data: { pincodes: newPincodesStr }
                        });
                    } else {
                        // Create a seller_pincode_request for admin approval
                        await tx.seller_pincode_requests.create({
                            data: {
                                seller_id: sellerRecord.id,
                                warehouse_id: warehouseIdInt,
                                pincodes: newPincodesStr,
                                status: 'PENDING'
                            }
                        });
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            message: existingAllocation
                ? 'Pincode modification request submitted for admin approval.'
                : 'Warehouse allocated successfully.'
        });
    } catch (error) {
        console.error('allocateWarehouse error:', error);
        res.status(500).json({ success: false, error: 'Failed to allocate warehouse' });
    }
};
