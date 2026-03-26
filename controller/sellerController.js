import SellerDAO from '../dao/seller.dao.js';
import ProductDAO from '../dao/product.dao.js';
import prisma from '../config/prisma.js';
import { resolveApplicablePlatformFee } from '../services/platformFeeService.js';

const ensureSellerOwnedProductsInInventory = async (sellerId) => {
    // Seller products can be approved (active=true) but still miss seller_products rows.
    // This backfills missing variant mappings so they show in seller inventory.
    const primaryAllocation = await prisma.warehouse_sellers.findFirst({
        where: { seller_id: sellerId, is_active: true },
        select: { warehouse_id: true },
        orderBy: { assigned_at: 'asc' }
    });

    if (!primaryAllocation?.warehouse_id) return;

    const sellerOwnedProducts = await prisma.products.findMany({
        where: {
            seller_id: sellerId,
            created_by: 'seller',
            active: true
        },
        select: {
            id: true,
            variants: {
                where: { active: true },
                select: {
                    id: true,
                    price: true,
                    old_price: true
                }
            }
        }
    });

    if (!sellerOwnedProducts.length) return;

    const productIds = sellerOwnedProducts.map((p) => p.id);
    const existingRows = await prisma.seller_products.findMany({
        where: {
            seller_id: sellerId,
            product_id: { in: productIds },
            warehouse_id: primaryAllocation.warehouse_id
        },
        select: { product_id: true, variant_id: true }
    });

    const existingKeys = new Set(
        existingRows
            .filter((r) => r.variant_id)
            .map((r) => `${r.product_id}:${r.variant_id}`)
    );

    const rowsToCreate = [];
    for (const product of sellerOwnedProducts) {
        for (const variant of product.variants || []) {
            const key = `${product.id}:${variant.id}`;
            if (existingKeys.has(key)) continue;

            rowsToCreate.push({
                seller_id: sellerId,
                product_id: product.id,
                variant_id: variant.id,
                warehouse_id: primaryAllocation.warehouse_id,
                stock_quantity: 0,
                reserved_quantity: 0,
                seller_offer_price: variant.price || 0,
                admin_selling_price: variant.price || 0,
                mrp: variant.old_price || variant.price || 0,
                status: 'APPROVED',
                is_active: true
            });
        }
    }

    if (rowsToCreate.length > 0) {
        await prisma.seller_products.createMany({
            data: rowsToCreate,
            skipDuplicates: true
        });
    }
};

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

        await ensureSellerOwnedProductsInInventory(req.user.seller_id);
        const products = await SellerDAO.getSellerProducts(req.user.seller_id, req.query);

        const mappedProducts = await Promise.all(products.map(async (sp) => {
            const fee = await resolveApplicablePlatformFee({
                categoryId: sp.products?.category_id,
                subcategoryId: sp.products?.subcategory_id,
                groupId: sp.products?.group_id,
            });
            const basePrice = Number(sp.admin_selling_price ?? sp.seller_offer_price ?? 0);
            const platformFeeAmount = (basePrice * fee.fee_percentage) / 100;
            const sellerEarnings = basePrice - platformFeeAmount;

            return {
                id: sp.id,
                product_id: sp.product_id,
                product_name: sp.products?.name,
                source_type: sp.products?.source_type,
                product_image: sp.products?.media?.[0]?.url || null,
                category: sp.products?.category?.name,
                variant_id: sp.variant_id,
                variant_name: sp.product_variants?.title,
                warehouse_id: sp.warehouse_id,
                warehouse_name: sp.warehouses?.name,
                stock_quantity: sp.stock_quantity,
                seller_offer_price: sp.seller_offer_price,
                admin_selling_price: sp.admin_selling_price,
                mrp: sp.mrp,
                status: sp.status,
                sku: sp.product_variants?.sku || '',
                created_at: sp.created_at,
                platform_fee_percentage: fee.fee_percentage,
                platform_fee_source: fee.source_level,
                platform_fee_amount: Number(platformFeeAmount.toFixed(2)),
                seller_earnings: Number(sellerEarnings.toFixed(2)),
            };
        }));

        res.status(200).json({
            success: true,
            data: mappedProducts,
            count: mappedProducts.length,
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

        const where = { active: true, source_type: 'DROP_SHIP' };

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

        const mappedProducts = await Promise.all(
            products.map(async (p) => {
                const basePrice = Number(p.variants?.[0]?.price || 0);
                const fee = await resolveApplicablePlatformFee({
                    categoryId: p.category_id,
                    subcategoryId: p.subcategory_id,
                    groupId: p.group_id,
                });
                const platformFeeAmount = (basePrice * fee.fee_percentage) / 100;
                const sellerEarnings = basePrice - platformFeeAmount;

                return {
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    imageUrl: p.media?.[0]?.url || null,
                    category: p.category?.name,
                    basePrice,
                    sku: p.variants?.[0]?.sku || '',
                    platform_fee_percentage: fee.fee_percentage,
                    platform_fee_source: fee.source_level,
                    platform_fee_source_type: fee.source_type || null,
                    platform_fee_amount: Number(platformFeeAmount.toFixed(2)),
                    seller_earnings: Number(sellerEarnings.toFixed(2)),
                    variants: p.variants?.map(v => ({
                        id: v.id,
                        title: v.title,
                        price: v.price,
                        sku: v.sku,
                    })),
                };
            })
        );

        res.status(200).json({
            success: true,
            data: mappedProducts,
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
 * Request new product addition (Full Form)
 */
export const requestNewProductFull = async (req, res) => {
    try {
        console.log("\n=== BACKEND SELLER: Received Request Body ===");
        
        // Get seller profile
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const {
            name,
            description,
            hsn_code,
            sac_code,
            gst_rate,
            cess_rate,
            vertical,
            source_type,
            category_id,
            subcategory_id,
            group_id,
            store_id,
            return_applicable,
            return_days,
            active, // Ignored
            has_variants,
            product_variants,
            images,
            media,
            brand_name,
            brand_id,
            faq,
            ...otherFields
        } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: "Product name is required" });
        }

        // Construct Product Data (FORCED ACTIVE: FALSE)
        const productData = {
            name,
            description,
            hsn_or_sac_code: hsn_code || sac_code,
            gst_rate: gst_rate ? parseFloat(gst_rate) : 0,
            cess_rate: req.body.cess_rate ? parseFloat(req.body.cess_rate) : 0,
            vertical: vertical || "qwik",
            source_type: "DROP_SHIP", // Forced for sellers
            return_applicable: !!return_applicable,
            return_days: return_days ? parseInt(return_days) : 0,
            active: false, // ENFORCED PENDING ADMIN APPROVAL
            has_variants: !!has_variants,
            faq: faq || null,
            created_by: "seller",
            seller_id: seller.id,
            updated_at: new Date(),
        };

        // Handle Relations
        if (category_id) productData.category = { connect: { id: category_id } };
        if (subcategory_id) productData.subcategory = { connect: { id: subcategory_id } };
        if (group_id) productData.group = { connect: { id: group_id } };

        const brandId = brand_name || brand_id;

        // Media
        const mediaArray = media && Array.isArray(media) ? media : images && Array.isArray(images) ? images : [];
        if (mediaArray && mediaArray.length > 0) {
            productData.media = {
                create: mediaArray.map((item, index) => {
                    if (typeof item === "string") {
                        return { media_type: "image", url: item, is_primary: index === 0, sort_order: index };
                    } else {
                        return {
                            media_type: item.media_type || "image",
                            url: item.url,
                            is_primary: item.is_primary !== undefined ? item.is_primary : index === 0,
                            sort_order: item.sort_order !== undefined ? item.sort_order : index,
                        };
                    }
                }),
            };
        }

        // Variants
        const hasVariantsActual = product_variants && Array.isArray(product_variants) && product_variants.length > 0;
        productData.has_variants = hasVariantsActual;

        if (hasVariantsActual) {
            productData.variants = {
                create: product_variants.map((v) => {
                    const variantData = {
                        title: v.variant_name || v.title,
                        sku: v.sku || `${name.substring(0, 3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        price: parseFloat(v.variant_price || 0),
                        old_price: v.variant_old_price ? parseFloat(v.variant_old_price) : null,
                        discount_percentage: v.discount_percentage ? parseInt(v.discount_percentage) : 0,
                        is_default: !!v.is_default,
                        active: true,
                        shipping_amount: v.shipping_amount ? parseFloat(v.shipping_amount) : 0,
                        packaging_details: v.packaging_details,
                        photo_url: v.photo_url || null,
                        net_quantity: v.net_quantity || null,
                        is_bulk_enabled: v.is_bulk_enabled !== undefined ? !!v.is_bulk_enabled : false,
                        bulk_min_quantity: v.bulk_min_quantity ? parseInt(v.bulk_min_quantity) : 50,
                        bulk_discount_percentage: v.bulk_discount_percentage ? parseInt(v.bulk_discount_percentage) : 0,
                        bulk_price: v.bulk_price ? parseFloat(v.bulk_price) : 0,
                        updated_at: new Date(),
                    };

                    if (v.attributes && Array.isArray(v.attributes) && v.attributes.length > 0) {
                        variantData.attributes = {
                            create: v.attributes.map((attr) => ({
                                attribute_name: attr.attribute_name,
                                attribute_value: attr.attribute_value,
                                price: attr.price ? parseFloat(attr.price) : null,
                                old_price: attr.old_price ? parseFloat(attr.old_price) : null,
                            })),
                        };
                    }

                    return variantData;
                }),
            };
        }

        const newProduct = await ProductDAO.createProduct(productData);

        // Handle Brand Relation
        if (brandId && newProduct) {
            try { await ProductDAO.addBrandToProduct(newProduct.id, brandId); } catch (e) { console.error(e); }
        }

        // Handle Store Link
        if (store_id && newProduct) {
            try { await ProductDAO.addRecommendedStore(newProduct.id, store_id); } catch (e) { console.error(e); }
        }

        res.status(201).json({
            success: true,
            message: "Product request submitted successfully. Awaiting admin approval.",
            productId: newProduct.id,
            product: newProduct,
        });

    } catch (error) {
        console.error('requestNewProductFull error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};


export const requestToSellProduct = async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ success: false, error: 'productIds array is required' });
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
                error: 'You are not assigned to any warehouse.'
            });
        }

        // Use the seller's primary assigned warehouse
        const assignedWarehouseId = seller.warehouse_sellers[0].warehouse_id;

        // Fetch all active variants for the given products
        const products = await prisma.products.findMany({
            where: { id: { in: productIds } },
            include: { variants: { where: { active: true } } }
        });

        if (!products || products.length === 0) {
            return res.status(404).json({ success: false, error: 'Products not found' });
        }

        let newEntries = [];

        products.forEach(product => {
            const variants = product.variants;
            if (variants && variants.length > 0) {
                variants.forEach(v => {
                    newEntries.push({
                        seller_id: seller.id,
                        product_id: product.id,
                        variant_id: v.id,
                        warehouse_id: assignedWarehouseId,
                        stock_quantity: 0,
                        seller_offer_price: 0,
                        admin_selling_price: 0,
                        mrp: 0,
                        status: 'PENDING_APPROVAL',
                    });
                });
            }
        });

        if (newEntries.length === 0) {
            return res.status(400).json({ success: false, error: 'Provided products have no active variants to sell' });
        }

        await prisma.seller_products.createMany({
            data: newEntries,
            skipDuplicates: true,
        });

        res.status(201).json({
            success: true,
            message: 'Product requests submitted. Awaiting admin approval.',
        });
    } catch (error) {
        console.error('requestToSellProduct error:', error);
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
            message: result?.status === 'PENDING_APPROVAL'
                ? 'Stock updated. Pending admin approval for price change.'
                : 'Stock updated successfully.',
        });
    } catch (error) {
        console.error('addProductStock error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Update stock quantity only (no price change, no approval needed)
 */
export const updateStockQuantity = async (req, res) => {
    try {
        const { id } = req.params;
        const { stock_quantity } = req.body;

        if (stock_quantity === undefined || parseInt(stock_quantity) < 0) {
            return res.status(400).json({ success: false, error: 'Valid stock_quantity is required' });
        }

        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const sellerProduct = await prisma.seller_products.findUnique({ where: { id } });
        if (!sellerProduct || sellerProduct.seller_id !== seller.id) {
            return res.status(404).json({ success: false, error: 'Product not found in your inventory' });
        }

        // Stock changes never require re-approval — update directly
        const updated = await prisma.seller_products.update({
            where: { id },
            data: { stock_quantity: parseInt(stock_quantity), updated_at: new Date() }
        });

        // Sync to inventory table so availability checks reflect new stock
        if (sellerProduct.variant_id) {
            await SellerDAO.recalculateSellerStock(sellerProduct.warehouse_id, sellerProduct.variant_id);
        }

        res.status(200).json({
            success: true,
            data: updated,
            message: 'Stock updated successfully'
        });
    } catch (error) {
        console.error('updateStockQuantity error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get low stock items for the seller (stock < threshold)
 */
export const getLowStockItems = async (req, res) => {
    try {
        const threshold = parseInt(req.query.threshold ?? 5);
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const items = await prisma.seller_products.findMany({
            where: {
                seller_id: seller.id,
                is_active: true,
                status: 'APPROVED',
                stock_quantity: { lte: threshold }
            },
            include: {
                products: { select: { id: true, name: true, media: { where: { is_primary: true }, take: 1, select: { url: true } } } },
                product_variants: { select: { id: true, title: true, sku: true } },
                warehouses: { select: { id: true, name: true } }
            },
            orderBy: { stock_quantity: 'asc' }
        });

        res.status(200).json({
            success: true,
            data: items.map(i => ({
                id: i.id,
                product_id: i.product_id,
                product_name: i.products?.name,
                product_image: i.products?.media?.[0]?.url ?? null,
                variant_id: i.variant_id,
                variant_name: i.product_variants?.title,
                sku: i.product_variants?.sku,
                warehouse_name: i.warehouses?.name,
                stock_quantity: i.stock_quantity,
                reserved_quantity: i.reserved_quantity,
                available: i.stock_quantity - i.reserved_quantity
            }))
        });
    } catch (error) {
        console.error('getLowStockItems error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get stock summary for seller dashboard
 */
export const getStockSummary = async (req, res) => {
    try {
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const [total, approved, pending, lowStock, agg] = await Promise.all([
            prisma.seller_products.count({ where: { seller_id: seller.id, is_active: true } }),
            prisma.seller_products.count({ where: { seller_id: seller.id, is_active: true, status: 'APPROVED' } }),
            prisma.seller_products.count({ where: { seller_id: seller.id, is_active: true, status: 'PENDING_APPROVAL' } }),
            prisma.seller_products.count({ where: { seller_id: seller.id, is_active: true, status: 'APPROVED', stock_quantity: { lte: 5 } } }),
            prisma.seller_products.aggregate({ where: { seller_id: seller.id, is_active: true, status: 'APPROVED' }, _sum: { stock_quantity: true } })
        ]);

        res.status(200).json({
            success: true,
            data: {
                total_products: total,
                approved_products: approved,
                pending_approval: pending,
                low_stock_count: lowStock,
                total_stock_units: agg._sum.stock_quantity ?? 0
            }
        });
    } catch (error) {
        console.error('getStockSummary error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Toggle product active/inactive in seller inventory
 */
export const toggleProductActive = async (req, res) => {
    try {
        const { id } = req.params;
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const sellerProduct = await prisma.seller_products.findUnique({ where: { id } });
        if (!sellerProduct || sellerProduct.seller_id !== seller.id) {
            return res.status(404).json({ success: false, error: 'Product not found in your inventory' });
        }

        const updated = await prisma.seller_products.update({
            where: { id },
            data: { is_active: !sellerProduct.is_active, updated_at: new Date() }
        });

        res.status(200).json({
            success: true,
            data: updated,
            message: `Product ${updated.is_active ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('toggleProductActive error:', error);
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
        if (sellerProduct.status === 'APPROVED') {
            return res.status(403).json({
                success: false,
                error: 'Price is locked after admin approval'
            });
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

        // Status mapping for Seller/Rider App
        const statusMap = {
            'PENDING': 'pending',
            'ACCEPTED': 'confirmed',
            'SHIPPED': 'shipped',
            'NEW': 'pending' // For compatibility with other app versions if any
        };

        const reverseStatusMap = {
            'pending': 'PENDING',
            'confirmed': 'ACCEPTED',
            'shipped': 'SHIPPED',
            'shipped_out': 'SHIPPED',
            'out_for_delivery': 'SHIPPED',
            'delivered': 'DELIVERED', // For lists that might show delivered
        };

        const queryFilters = { ...req.query };
        if (queryFilters.status && statusMap[queryFilters.status]) {
            queryFilters.status = statusMap[queryFilters.status];
        }

        const orders = await SellerDAO.getSellerOrders(seller.id, queryFilters);

        // Get current platform charge settings
        const chargeSettings = await prisma.charge_settings.findFirst({
            orderBy: { id: 'desc' }
        });
        const platformChargePercent = parseFloat(chargeSettings?.platform_charge || 0);

        res.status(200).json({
            success: true,
            data: orders.map(o => {
                // Calculate seller rate for each order item
                const orderItems = o.order_items?.map(oi => {
                    const productPrice = parseFloat(oi.price || 0);
                    const sellerRate = productPrice - (productPrice * platformChargePercent / 100);
                    
                    return {
                        product_id: oi.product_variants?.products?.id,
                        variant_id: oi.variant_id,
                        product_name: oi.product_variants?.products?.name,
                        productName: oi.product_variants?.products?.name,
                        variant_name: oi.product_variants?.title,
                        quantity: oi.quantity,
                        price: productPrice, // Product value (customer paid)
                        sellerRate: parseFloat(sellerRate.toFixed(2)), // Seller's net rate after platform charge
                        platformCharge: parseFloat((productPrice * platformChargePercent / 100).toFixed(2)), // Platform charge amount
                        variant: oi.product_variants
                    };
                });

                // Calculate totals
                const totalProductValue = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const totalPlatformCharge = orderItems.reduce((sum, item) => sum + (item.platformCharge * item.quantity), 0);
                const totalSellerAmount = orderItems.reduce((sum, item) => sum + (item.sellerRate * item.quantity), 0);

                return {
                    id: o.id,
                    order_number: o.tracking_number || o.id.slice(0, 8).toUpperCase(),
                    status: reverseStatusMap[o.status] || o.status,
                    total: o.total, // For frontend totalAmount
                    total_amount: o.total,
                    totalAmount: o.total, // Added Explicitly for Rider App
                    customer_name: o.users?.name,
                    userAddress: o.address,
                    address: o.address,
                    userPincode: o.address?.split(',').pop()?.trim() || '',
                    createdAt: o.created_at,
                    created_at: o.created_at,
                    fulfillmentType: o.is_bulk_order ? 'WHOLESALE' : 'DROPSHIP',
                    is_bulk_order: o.is_bulk_order,
                    order_items: orderItems,
                    items: orderItems.map(oi => ({
                        product_name: oi.product_name,
                        productName: oi.productName,
                        variant_name: oi.variant_name,
                        quantity: oi.quantity,
                        price: oi.price,
                        sellerRate: oi.sellerRate,
                        platformCharge: oi.platformCharge,
                    })),
                    // Order-level totals for seller
                    totalProductValue: parseFloat(totalProductValue.toFixed(2)),
                    totalPlatformCharge: parseFloat(totalPlatformCharge.toFixed(2)),
                    totalSellerAmount: parseFloat(totalSellerAmount.toFixed(2)),
                    platformChargePercent: platformChargePercent,
                };
            }),
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
                        product_variants: {
                            select: {
                                id: true, title: true, price: true,
                                products: { select: { id: true, name: true } }
                            }
                        }
                    }
                },
                users: {
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
 * Update seller order status (confirm/ship/cancel)
 */
export const updateSellerOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body; // 'CONFIRMED', 'SHIPPED', 'CANCELLED'
        
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        // Verify this order belongs to seller
        const order = await prisma.orders.findUnique({
            where: { id: orderId },
            include: {
                order_items: {
                    include: {
                        product_variants: {
                            select: {
                                products: { select: { id: true } }
                            }
                        }
                    }
                }
            }
        });

        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // Check if any item in this order belongs to the seller
        const sellerProductIds = await prisma.seller_products.findMany({
            where: { seller_id: seller.id, status: 'APPROVED' },
            select: { product_id: true, variant_id: true }
        });

        const hasMatchingItem = order.order_items.some(item => {
            const productId = item.product_variants?.products?.id || item.product_id;
            const variantId = item.variant_id;
            return sellerProductIds.some(sp => 
                sp.product_id === productId && (!sp.variant_id || sp.variant_id === variantId)
            );
        });

        if (!hasMatchingItem) {
            return res.status(403).json({ success: false, error: 'You do not supply items in this order' });
        }

        // Status mapping from frontend to DB
        const statusMap = {
            'pending': 'PENDING',
            'confirmed': 'ACCEPTED',
            'processing': 'PROCESSING',
            'shipped': 'SHIPPED',
            'out_for_delivery': 'OUT_FOR_DELIVERY',
            'delivered': 'DELIVERED',
            'cancelled': 'CANCELLED',
        };

        const dbStatus = statusMap[status?.toLowerCase()] || status.toUpperCase();

        const updatedOrder = await prisma.orders.update({
            where: { id: orderId },
            data: { status: dbStatus }
        });

        res.status(200).json({ 
            success: true, 
            message: `Order ${dbStatus.toLowerCase()} successfully`,
            data: updatedOrder 
        });
    } catch (error) {
        console.error('updateSellerOrderStatus error:', error);
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

/**
 * Toggle Store Open/Close Status
 */
export const toggleStoreStatus = async (req, res) => {
    try {
        const sellerId = req.user.sellerId;
        const { is_open } = req.body;

        if (typeof is_open !== 'boolean') {
            return res.status(400).json({ success: false, error: 'is_open boolean is required' });
        }

        // We use sellerId from the token's user. If it's not present, we get it via user_id
        let realSellerId = sellerId;
        if (!realSellerId) {
            const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
            if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });
            realSellerId = seller.id;
        }

        const updatedSeller = await SellerDAO.toggleStoreStatus(realSellerId, is_open);

        res.status(200).json({
            success: true,
            message: `Store is now ${is_open ? 'open' : 'closed'}`,
            data: { is_open: updatedSeller.is_open }
        });
    } catch (error) {
        console.error('Error toggling store status:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
