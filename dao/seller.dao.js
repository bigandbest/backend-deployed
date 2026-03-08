import prisma from '../config/prisma.js';

class SellerDAO {
    /**
     * Get seller by user ID
     */
    async getByUserId(userId) {
        return prisma.sellers.findUnique({
            where: { user_id: userId },
            include: {
                user: {
                    select: { id: true, email: true, name: true, phone: true, role: true }
                },
                warehouse_sellers: {
                    include: {
                        warehouse: {
                            select: { id: true, name: true, type: true, location: true }
                        }
                    }
                }
            }
        });
    }

    /**
     * Get seller by ID
     */
    async getById(sellerId) {
        return prisma.sellers.findUnique({
            where: { id: sellerId },
            include: {
                user: {
                    select: { id: true, email: true, name: true, phone: true, role: true }
                },
                warehouse_sellers: {
                    include: {
                        warehouse: {
                            select: { id: true, name: true, type: true, location: true }
                        }
                    }
                }
            }
        });
    }

    /**
     * List all sellers with filters
     */
    async list(filters = {}) {
        const where = {};
        if (filters.seller_type) where.seller_type = filters.seller_type;
        if (filters.is_active !== undefined) where.is_active = filters.is_active;
        if (filters.is_verified !== undefined) where.is_verified = filters.is_verified;

        return prisma.sellers.findMany({
            where,
            include: {
                user: {
                    select: { id: true, email: true, name: true, phone: true, role: true }
                },
                warehouse_sellers: {
                    include: {
                        warehouse: {
                            select: { id: true, name: true, type: true }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    /**
     * Get seller products (what the seller is selling)
     */
    async getSellerProducts(sellerId, filters = {}) {
        const where = { seller_id: sellerId };
        if (filters.status) where.status = filters.status;
        if (filters.warehouse_id) where.warehouse_id = parseInt(filters.warehouse_id);

        return prisma.seller_products.findMany({
            where,
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        source_type: true,
                        media: { take: 1 }
                    }
                },
                variant: {
                    select: {
                        id: true,
                        title: true,
                        sku: true,
                        price: true
                    }
                },
                warehouse: {
                    select: { id: true, name: true, type: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    /**
     * Add/update seller product stock
     */
    async upsertSellerProduct(data) {
        const { seller_id, product_id, variant_id, warehouse_id, stock_quantity, seller_offer_price, mrp } = data;

        // Use findFirst + create/update because Prisma upsert can't handle null
        // in compound unique keys (variant_id is nullable UUID)
        const where = {
            seller_id,
            product_id,
            warehouse_id: parseInt(warehouse_id),
        };
        if (variant_id) {
            where.variant_id = variant_id;
        } else {
            where.variant_id = null;
        }

        const existing = await prisma.seller_products.findFirst({ where });

        if (existing) {
            // Check if quantity or price changed
            const isChanged =
                parseInt(stock_quantity) !== existing.stock_quantity ||
                parseFloat(seller_offer_price) !== parseFloat(existing.seller_offer_price);

            const updated = await prisma.seller_products.update({
                where: { id: existing.id },
                data: {
                    stock_quantity: parseInt(stock_quantity) || 0,
                    seller_offer_price: parseFloat(seller_offer_price) || 0,
                    mrp: mrp ? parseFloat(mrp) : null,
                    status: isChanged ? 'PENDING_APPROVAL' : existing.status,
                    updated_at: new Date(),
                }
            });

            // If it was already approved and we just changed it to pending, 
            // we should return the stock to the admin (Zonal Warehouse) and recalculate
            if (isChanged && existing.status === 'APPROVED') {
                const sellerProduct = await prisma.seller_products.findUnique({
                    where: { id: existing.id },
                    include: { warehouse: true }
                });

                const zonalWarehouseId = sellerProduct.warehouse?.parent_warehouse_id;
                if (zonalWarehouseId && variant_id) {
                    await prisma.$executeRaw`
                        UPDATE inventory 
                        SET admin_stock = admin_stock + ${existing.stock_quantity},
                            stock_qty = stock_qty + ${existing.stock_quantity},
                            updated_at = NOW()
                        WHERE warehouse_id = ${zonalWarehouseId} 
                          AND variant_id = ${variant_id}::uuid
                    `;
                }

                await this.recalculateSellerStock(warehouse_id, variant_id);
            }

            return updated;
        } else {
            return prisma.seller_products.create({
                data: {
                    seller_id,
                    product_id,
                    variant_id: variant_id || null,
                    warehouse_id: parseInt(warehouse_id),
                    stock_quantity: parseInt(stock_quantity) || 0,
                    seller_offer_price: parseFloat(seller_offer_price) || 0,
                    mrp: mrp ? parseFloat(mrp) : null,
                    status: 'PENDING_APPROVAL',
                }
            });
        }
    }

    /**
     * Update seller offer price
     */
    async updateOfferPrice(sellerProductId, offerPrice) {
        return prisma.seller_products.update({
            where: { id: sellerProductId },
            data: {
                seller_offer_price: parseFloat(offerPrice),
                status: 'PENDING_APPROVAL',
                updated_at: new Date(),
            }
        });
    }

    /**
     * Get negotiations for a seller
     */
    async getNegotiations(sellerId, status = null) {
        const where = { seller_id: sellerId };
        if (status) where.status = status;

        return prisma.seller_negotiations.findMany({
            where,
            include: {
                product: {
                    include: { media: { take: 1 } }
                }
            },
            orderBy: { updated_at: 'desc' }
        });
    }

    /**
     * Create a negotiation
     */
    async createNegotiation(data) {
        return prisma.seller_negotiations.create({
            data: {
                seller_id: data.seller_id,
                product_id: data.product_id,
                variant_id: data.variant_id,
                proposed_quantity: parseInt(data.proposed_quantity) || 0,
                seller_proposed_price: parseFloat(data.seller_proposed_price),
                seller_notes: data.seller_notes,
                status: 'PENDING_APPROVAL',
            }
        });
    }

    /**
     * Accept counter offer
     */
    async acceptCounterOffer(negotiationId, sellerId) {
        const negotiation = await prisma.seller_negotiations.findUnique({
            where: { id: negotiationId }
        });

        if (!negotiation || negotiation.seller_id !== sellerId) {
            throw new Error('Negotiation not found');
        }

        if (negotiation.status !== 'COUNTER_OFFERED') {
            throw new Error('No counter offer to accept');
        }

        return prisma.seller_negotiations.update({
            where: { id: negotiationId },
            data: {
                status: 'ACCEPTED',
                final_agreed_price: negotiation.admin_counter_price,
                updated_at: new Date(),
            }
        });
    }

    /**
     * Decline counter offer with optional new price
     */
    async declineCounterOffer(negotiationId, sellerId, newOfferPrice) {
        const negotiation = await prisma.seller_negotiations.findUnique({
            where: { id: negotiationId }
        });

        if (!negotiation || negotiation.seller_id !== sellerId) {
            throw new Error('Negotiation not found');
        }

        const updateData = {
            status: newOfferPrice ? 'PENDING_APPROVAL' : 'DECLINED',
            updated_at: new Date(),
        };

        if (newOfferPrice) {
            updateData.seller_proposed_price = parseFloat(newOfferPrice);
        }

        return prisma.seller_negotiations.update({
            where: { id: negotiationId },
            data: updateData,
        });
    }

    /**
     * Get seller orders
     */
    async getSellerOrders(sellerId, filters = {}) {
        // Get product IDs this seller supplies
        const sellerProducts = await prisma.seller_products.findMany({
            where: { seller_id: sellerId, status: 'APPROVED' },
            select: { product_id: true, variant_id: true }
        });

        const productIds = sellerProducts.map(sp => sp.product_id);

        if (productIds.length === 0) {
            return [];
        }

        const where = {
            order_items: {
                some: {
                    OR: sellerProducts.map(sp => ({
                        variant: { product_id: sp.product_id },
                        ...(sp.variant_id ? { variant_id: sp.variant_id } : {})
                    }))
                }
            }
        };

        if (filters.status) {
            where.status = filters.status;
        }

        return prisma.orders.findMany({
            where,
            include: {
                order_items: {
                    where: {
                        OR: sellerProducts.map(sp => ({
                            variant: { product_id: sp.product_id },
                            ...(sp.variant_id ? { variant_id: sp.variant_id } : {})
                        }))
                    },
                    include: {
                        variant: {
                            select: { id: true, title: true, price: true, product: { select: { id: true, name: true } } }
                        }
                    }
                },
                user: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { created_at: 'desc' },
            take: parseInt(filters.limit) || 50,
        });
    }

    /**
     * Get seller dashboard summary
     */
    async getDashboardStats(sellerId) {
        const [products, pendingNegotiations, totalStock, sellerRecord, pincodeRequests] = await Promise.all([
            prisma.seller_products.count({ where: { seller_id: sellerId, is_active: true } }),
            prisma.seller_negotiations.count({ where: { seller_id: sellerId, status: 'COUNTER_OFFERED' } }),
            prisma.seller_products.aggregate({
                where: { seller_id: sellerId, is_active: true },
                _sum: { stock_quantity: true }
            }),
            prisma.sellers.findUnique({
                where: { id: sellerId }
            }),
            prisma.seller_pincode_requests.findMany({
                where: { seller_id: sellerId },
                orderBy: { created_at: 'desc' }
            })
        ]);

        let allPincodes = [];
        let idCounter = 1;

        // 1. Add currently approved pincode from seller record (legacy/direct field)
        if (sellerRecord && sellerRecord.pincode) {
            const activePins = sellerRecord.pincode.split(',').map(p => p.trim()).filter(Boolean);
            activePins.forEach(pin => {
                allPincodes.push({ id: `approved-${idCounter++}`, pincode: pin, status: 'APPROVED' });
            });
        }

        // 2. Add requests from the new requests table (including non-pending if not already in list)
        if (pincodeRequests && pincodeRequests.length > 0) {
            pincodeRequests.forEach(req => {
                // Check if this pincode is already in allPincodes (as approved)
                const exists = allPincodes.some(p => p.pincode === req.pincode);
                if (!exists) {
                    allPincodes.push({
                        id: req.id,
                        pincode: req.pincode,
                        status: req.status
                    });
                }
            });
        }

        const approvedCount = allPincodes.filter(p => p.status === 'APPROVED').length;

        return {
            total_products: products,
            pending_negotiations: pendingNegotiations,
            total_stock: totalStock._sum.stock_quantity || 0,
            pincodes: allPincodes,
            activePincodes: approvedCount
        };
    }


    /**
     * Get seller earnings
     */
    async getEarnings(sellerId, period = 'month') {
        // Get seller's product IDs
        const sellerProducts = await prisma.seller_products.findMany({
            where: { seller_id: sellerId },
            select: { product_id: true, seller_offer_price: true }
        });

        // Simple earnings calculation - in production would use order_items with seller tracking
        const totalOfferValue = sellerProducts.reduce((sum, sp) => {
            return sum + parseFloat(sp.seller_offer_price || 0);
        }, 0);

        return {
            period,
            total_earnings: totalOfferValue,
            product_count: sellerProducts.length,
        };
    }

    /**
     * Update seller stock in inventory (recalculate seller_stock)
     */
    async recalculateSellerStock(warehouseId, variantId) {
        const { syncInventoryForVariant } = await import('../utils/inventorySync.js');

        // Sum stock from all sellers for this variant in this warehouse
        const result = await prisma.seller_products.aggregate({
            where: {
                warehouse_id: parseInt(warehouseId),
                variant_id: variantId,
                is_active: true,
                status: 'APPROVED',
            },
            _sum: { stock_quantity: true },
        });

        const sellerStock = result._sum.stock_quantity || 0;

        // Get the product_id for this variant
        const variant = await prisma.product_variants.findUnique({
            where: { id: variantId },
            select: { product_id: true }
        });

        if (variant) {
            // Upsert into product_warehouse_stock
            const existingPWS = await prisma.product_warehouse_stock.findFirst({
                where: {
                    variant_id: variantId,
                    warehouse_id: parseInt(warehouseId)
                },
                select: { id: true }
            });

            if (existingPWS) {
                await prisma.product_warehouse_stock.update({
                    where: { id: existingPWS.id },
                    data: {
                        stock_quantity: sellerStock,
                        updated_at: new Date()
                    }
                });
            } else {
                await prisma.product_warehouse_stock.create({
                    data: {
                        product_id: variant.product_id,
                        variant_id: variantId,
                        warehouse_id: parseInt(warehouseId),
                        stock_quantity: sellerStock,
                        reserved_quantity: 0
                    }
                });
            }

            // Sync to inventory table (this upserts — creates if missing, updates if exists)
            await syncInventoryForVariant(variantId, warehouseId);
        }

        return sellerStock;
    }

    /**
     * Toggle Store Open/Close Status
     */
    async toggleStoreStatus(sellerId, isOpen) {
        return await prisma.sellers.update({
            where: { id: sellerId },
            data: { is_open: isOpen }
        });
    }
}

export default new SellerDAO();
