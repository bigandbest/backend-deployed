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
export async function getProductsBySection(req, res) {
    try {
        const { section_key } = req.params;
        console.log("🔍 Getting products for section:", section_key);

        // Get section info
        const sectionData = await ProductSectionDAO.getByKey(section_key);

        if (!sectionData) {
            console.log("⚠️ Section not found:", section_key);
            return res
                .status(404)
                .json({ success: false, error: `Section '${section_key}' not found or inactive` });
        }

        if (!sectionData.is_active) {
            return res.status(404).json({ success: false, error: `Section '${section_key}' is inactive` });
        }

        console.log("✅ Found section (DAO):", sectionData.section_name);

        let allProducts = [];
        let directCount = 0;
        let groupCount = 0;
        let storeCount = 0;

        // 1. Get direct section-product mappings
        const directMappings = await StoreSectionMappingDAO.getProductsBySection(sectionData.id);
        if (directMappings && directMappings.length > 0) {
            const products = directMappings.map(m => m.products).filter(Boolean);
            allProducts = [...allProducts, ...products];
            directCount = products.length;
        }

        // 2. Get section-group mappings from NEW TABLE
        const groupMappingsNew = await ProductSectionGroupDAO.listBySection(sectionData.id);

        if (groupMappingsNew && groupMappingsNew.length > 0) {
            const groupIds = groupMappingsNew.map((m) => m.group_id);
            console.log("✅ Found group mappings (New DAO):", groupIds);

            // Fetch products for these groups via subcategory_id
            const groupsData = await prisma.groups.findMany({
                where: { id: { in: groupIds } },
                select: { subcategory_id: true }
            });

            if (groupsData.length > 0) {
                const subcategoryIds = groupsData.map((g) => g.subcategory_id).filter(Boolean);

                const groupProducts = await prisma.products.findMany({
                    where: {
                        subcategory_id: { in: subcategoryIds },
                        active: true
                    },
                    orderBy: { created_at: 'desc' },
                    take: 20
                });

                allProducts = [...allProducts, ...groupProducts];
                groupCount = groupProducts.length;
                console.log("✅ Found group products (DAO):", groupProducts.length);
            }
        }

        // 3. Get products from stores mapped to this section
        const storeMappings = await StoreSectionMappingDAO.getStoresBySection(sectionData.id);

        if (storeMappings && storeMappings.length > 0) {
            const storeIds = storeMappings.map(m => m.store_id).filter(Boolean);

            const storeProducts = await prisma.products.findMany({
                where: {
                    store_id: { in: storeIds },
                    active: true
                },
                orderBy: { created_at: 'desc' },
                take: 10
            });

            allProducts = [...allProducts, ...storeProducts];
            storeCount = storeProducts.length;
        }

        // Remove duplicates based on product id
        const uniqueProducts = allProducts.filter(
            (product, index, self) =>
                index === self.findIndex((p) => p.id === product.id)
        );

        console.log("✅ Total unique products (DAO):", uniqueProducts.length);

        res.json({
            success: true,
            section: sectionData,
            products: uniqueProducts,
            mapping_types: {
                direct_products: directCount,
                group_products: groupCount,
                store_products: storeCount,
                total_unique_products: uniqueProducts.length,
            },
        });
    } catch (err) {
        console.error("💥 Get products by section error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
}