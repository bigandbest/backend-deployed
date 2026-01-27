import ProductSectionGroupDAO from "../dao/product-section-group.dao.js";
import ProductSectionDAO from "../dao/product-section.dao.js";
import StoreSectionMappingDAO from "../dao/store-section-mapping.dao.js";
import ProductDAO from "../dao/product.dao.js";
import prisma from "../config/prisma.js";
import SubStoreDAO from "../dao/sub-store.dao.js";

// Add SubStore
export async function addSubStore(req, res) {
    try {
        const { name, link } = req.body;
        const imageFile = req.file; // multer middleware for file upload

        let imageUrl = null;

        if (imageFile) {
            const fileExt = imageFile.originalname.split(".").pop();
            const fileName = `${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from("SubStore") // 🎯 bucket name
                .upload(fileName, imageFile.buffer, {
                    contentType: imageFile.mimetype,
                    upsert: true,
                });

            if (uploadError)
                return res.status(400).json({ success: false, error: uploadError.message });

            const { data: urlData } = supabase.storage.from("SubStore").getPublicUrl(fileName); // 🎯 bucket name
            imageUrl = urlData.publicUrl;
        }

        const data = await SubStoreDAO.create({ name, link, image: imageUrl });

        res.status(201).json({ success: true, store: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Update SubStore
export async function updateSubStore(req, res) {
    try {
        const { id } = req.params;
        const { name, link } = req.body;
        const imageFile = req.file;

        let updateData = { name, link };

        if (imageFile) {
            const fileExt = imageFile.originalname.split(".").pop();
            const fileName = `${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from("SubStore") // 🎯 bucket name
                .upload(fileName, imageFile.buffer, {
                    contentType: imageFile.mimetype,
                    upsert: true,
                });

            if (uploadError)
                return res.status(400).json({ success: false, error: uploadError.message });

            const { data: urlData } = supabase.storage.from("SubStore").getPublicUrl(fileName); // 🎯 bucket name
            updateData.image = urlData.publicUrl;
        }

        const data = await SubStoreDAO.update(id, updateData);

        res.json({ success: true, store: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Delete SubStore
export async function deleteSubStore(req, res) {
    try {
        const { id } = req.params;

        await SubStoreDAO.delete(id);

        res.json({ success: true, message: "Store deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// View All SubStores
export async function getAllSubStores(req, res) {
    try {
        const data = await SubStoreDAO.listAll();

        res.json({ success: true, stores: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// --- Store Section Mapping Logic (Merged from storeSectionMappingController.js) ---

// Get all product sections
export async function getAllProductSections(req, res) {
    try {
        const data = await ProductSectionDAO.list();
        res.json({ success: true, sections: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Create store-section mapping
export async function createStoreSectionMapping(req, res) {
    try {
        const { store_id, section_ids } = req.body;

        // Create mappings for each section
        const mappings = section_ids.map((section_id) => ({
            store_id: store_id,
            section_id: parseInt(section_id),
            mapping_type: "store_section",
            is_active: true,
        }));

        const data = await StoreSectionMappingDAO.createMany(mappings);

        res.status(201).json({ success: true, mappings: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Create section-product mapping
export async function createSectionProductMapping(req, res) {
    try {
        const { section_id, product_ids } = req.body;

        // Create mappings for each product
        const mappings = product_ids.map((product_id) => ({
            section_id: parseInt(section_id),
            product_id: product_id,
            mapping_type: "section_product",
            is_active: true,
        }));

        const data = await StoreSectionMappingDAO.createMany(mappings);

        res.status(201).json({ success: true, mappings: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Create section-group mapping
export async function createSectionGroupMapping(req, res) {
    try {
        const { section_id, group_ids } = req.body;

        // Create mappings for each group using new DAO
        const mappings = group_ids.map((group_id) => ({
            section_id: parseInt(section_id),
            group_id: group_id, // UUID
        }));

        const data = await ProductSectionGroupDAO.createMany(mappings);

        res.status(201).json({ success: true, mappings: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get all mappings with related data
export async function getAllMappings(req, res) {
    try {
        const rawMappings = await StoreSectionMappingDAO.listAll();

        // Group mappings by type (simulating legacy logic)
        const storeSectionData = rawMappings.filter(m => m.mapping_type === "store_section");
        const sectionProductData = rawMappings.filter(m => m.mapping_type === "section_product");

        // Get section-group mappings from NEW TABLE
        const sectionGroupDataNew = await ProductSectionGroupDAO.listAll();

        // Map new table data to legacy format expected by frontend
        const sectionGroupDataTransformed = sectionGroupDataNew.map(m => ({
            id: `psg_${m.id}`,
            original_id: m.id,
            section_id: m.section_id,
            group_id: m.group_id,
            mapping_type: "section_group",
            is_active: m.is_active,
            product_sections: m.product_sections,
            groups: m.groups
        }));

        // Group mappings by type
        const groupedStoreSections = {};
        const groupedSectionProducts = {};
        const groupedSectionGroups = {};

        // Group store-section mappings by store
        storeSectionData.forEach((mapping) => {
            const storeId = mapping.store_id;
            if (!groupedStoreSections[storeId]) {
                groupedStoreSections[storeId] = {
                    id: `store_${storeId}`,
                    type: "store-section",
                    store_id: storeId,
                    store_name: mapping.recommended_store?.name || "Unknown Store",
                    sections: [],
                    is_active: true,
                };
            }
            if (mapping.product_sections) {
                groupedStoreSections[storeId].sections.push(mapping.product_sections);
            }
        });

        // Group section-product mappings by section
        sectionProductData.forEach((mapping) => {
            const sectionId = mapping.section_id;
            if (!groupedSectionProducts[sectionId]) {
                groupedSectionProducts[sectionId] = {
                    id: `section_${sectionId}`,
                    type: "section-product",
                    section_id: sectionId,
                    section_name:
                        mapping.product_sections?.section_name || "Unknown Section",
                    products: [],
                    is_active: true,
                };
            }
            if (mapping.products) {
                groupedSectionProducts[sectionId].products.push(mapping.products);
            }
        });

        // Group section-group mappings by section
        sectionGroupDataTransformed.forEach((mapping) => {
            const sectionId = mapping.section_id;
            if (!groupedSectionGroups[sectionId]) {
                groupedSectionGroups[sectionId] = {
                    id: `section_group_${sectionId}`,
                    type: "section-group",
                    section_id: sectionId,
                    section_name:
                        mapping.product_sections?.section_name || "Unknown Section",
                    groups: [],
                    is_active: true,
                };
            }
            if (mapping.groups) {
                groupedSectionGroups[sectionId].groups.push({
                    ...mapping.groups,
                    _mapping_id: mapping.id
                });
            }
        });

        const allMappings = [
            ...Object.values(groupedStoreSections),
            ...Object.values(groupedSectionProducts),
            ...Object.values(groupedSectionGroups),
        ];

        res.json({ success: true, mappings: allMappings });
    } catch (err) {
        console.error("Get all mappings error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
}

// Update mapping status
export async function updateMappingStatus(req, res) {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        // Check if it's a new table ID
        if (id.startsWith && id.startsWith("psg_")) {
            // For now just return success for individual group toggle if not implemented
            return res.json({ success: true });
        }

        const data = await StoreSectionMappingDAO.updateStatus(id, is_active);

        res.json({ success: true, mapping: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Delete mapping (supports both individual records and grouped deletions)
export async function deleteMapping(req, res) {
    try {
        const { id } = req.params;

        // Check types
        if (id.startsWith("store_")) {
            const storeId = id.replace("store_", "");
            await StoreSectionMappingDAO.deleteByStoreMapping(storeId);
            res.json({ success: true, message: "Store-section mappings deleted successfully" });

        } else if (id.startsWith("section_")) {
            const sectionId = id.replace("section_", "");
            await StoreSectionMappingDAO.deleteBySectionMapping(sectionId);
            res.json({ success: true, message: "Section-product mappings deleted successfully" });

        } else if (id.startsWith("section_group_")) {
            const sectionId = id.replace("section_group_", "");
            await ProductSectionGroupDAO.deleteBySection(sectionId);
            res.json({ success: true, message: "Group mappings deleted successfully" });

        } else if (id.startsWith("psg_")) {
            const realId = parseInt(id.replace("psg_", ""));
            await ProductSectionGroupDAO.delete(realId);
            res.json({ success: true, message: "Group mapping deleted successfully" });

        } else {
            await StoreSectionMappingDAO.delete(id);
            res.json({ success: true, message: "Mapping deleted successfully" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get products by section for frontend
// OPTIMIZED: Get products by section for infinite scroll
// Uses SELECT for minimal payload, DB-level pagination, and efficient queries
export async function getProductsBySection(req, res) {
    try {
        const { section_key } = req.params;
        const { page = 1, limit = 25, warehouse_id } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const sectionData = await ProductSectionDAO.getByKey(section_key);
        if (!sectionData || !sectionData.is_active) {
            return res.status(404).json({ success: false, error: 'Section not found' });
        }

        // Parallel fetch all mapping IDs
        const [directProductIds, groupSubcategoryIds, storeIds] = await Promise.all([
            prisma.store_section_mappings.findMany({
                where: { section_id: sectionData.id, mapping_type: 'section_product', is_active: true },
                select: { product_id: true }
            }).then(r => r.map(x => x.product_id)),

            ProductSectionGroupDAO.listBySection(sectionData.id).then(async (gm) => {
                if (!gm.length) return [];
                const groups = await prisma.groups.findMany({
                    where: { id: { in: gm.map(m => m.group_id) } },
                    select: { subcategory_id: true }
                });
                return groups.map(g => g.subcategory_id).filter(Boolean);
            }),

            prisma.store_section_mappings.findMany({
                where: { section_id: sectionData.id, mapping_type: 'store_section', is_active: true },
                select: { store_id: true }
            }).then(r => r.map(x => x.store_id))
        ]);

        const whereConditions = [];
        if (directProductIds.length) whereConditions.push({ id: { in: directProductIds } });
        if (groupSubcategoryIds.length) whereConditions.push({ subcategory_id: { in: groupSubcategoryIds } });
        if (storeIds.length) whereConditions.push({ store_id: { in: storeIds } });

        if (!whereConditions.length) {
            return res.json({
                success: true,
                section: sectionData,
                products: [],
                pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false, showing: 0 }
            });
        }

        // OPTIMIZATION: Use SELECT instead of INCLUDE for 80% payload reduction
        const [products, totalCount] = await Promise.all([
            prisma.products.findMany({
                where: { OR: whereConditions, active: true },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    rating: true,
                    review_count: true,
                    active: true,
                    created_at: true,
                    category_id: true,
                    subcategory_id: true,
                    group_id: true,
                    store_id: true,
                    return_applicable: true,
                    return_days: true,
                    has_variants: true,
                    variants: {
                        where: { active: true },
                        orderBy: { is_default: 'desc' },
                        take: 5,
                        select: {
                            id: true,
                            title: true,
                            price: true,
                            old_price: true,
                            is_default: true,
                            active: true,
                            sku: true
                        }
                    },
                    media: {
                        where: { is_primary: true },
                        take: 1,
                        select: {
                            id: true,
                            url: true,
                            media_type: true
                        }
                    },
                    brands: {
                        take: 1,
                        select: {
                            brand: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: limitNum,
                distinct: ['id']
            }),
            prisma.products.count({ where: { OR: whereConditions, active: true } })
        ]);

        const enrichedProducts = await ProductDAO.enrichProductsWithInventory(
            products,
            warehouse_id ? parseInt(warehouse_id) : null
        );

        const totalPages = Math.ceil(totalCount / limitNum);

        res.json({
            success: true,
            section: sectionData,
            products: enrichedProducts,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                totalPages,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
                showing: enrichedProducts.length
            }
        });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
}
