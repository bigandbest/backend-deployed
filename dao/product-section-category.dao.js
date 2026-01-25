import prisma from '../config/prisma.js';

class ProductSectionCategoryDAO {
    async listBySection(sectionId) {
        return await prisma.product_section_categories.findMany({
            where: { section_id: parseInt(sectionId) },
            select: { category_id: true, created_at: true },
            orderBy: { created_at: 'asc' }
        });
    }

    async addMany(mappings) {
        const results = [];
        for (const mapping of mappings) {
            // Check if exists first to emulate ON CONFLICT DO NOTHING
            const existing = await prisma.product_section_categories.findUnique({
                where: {
                    section_id_category_id: {
                        section_id: mapping.section_id,
                        category_id: mapping.category_id
                    }
                }
            });

            if (!existing) {
                try {
                    const result = await prisma.product_section_categories.create({
                        data: {
                            section_id: mapping.section_id,
                            category_id: mapping.category_id
                        }
                    });
                    results.push(result);
                } catch (error) {
                    console.error("Error inserting category mapping:", error);
                    // Continue even if one fails
                }
            }
        }
        return results;
    }

    async remove(sectionId, categoryId) {
        return await prisma.product_section_categories.deleteMany({
            where: {
                section_id: parseInt(sectionId),
                category_id: categoryId
            }
        });
    }

    async listByProductCategory(categoryId) {
        const results = await prisma.product_section_categories.findMany({
            where: { category_id: categoryId },
            include: {
                product_sections: true
            },
            orderBy: { created_at: 'asc' }
        });

        // Transform to match previous raw query output structure
        return results.map(row => ({
            id: row.id,
            created_at: row.created_at,
            section_id: row.product_sections.id,
            section_key: row.product_sections.section_key,
            section_name: row.product_sections.section_name,
            is_active: row.product_sections.is_active,
            component_name: row.product_sections.component_name
        }));
    }
}

export default new ProductSectionCategoryDAO();
