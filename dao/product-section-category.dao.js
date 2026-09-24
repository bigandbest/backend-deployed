import prisma from '../config/prisma.js';

class ProductSectionCategoryDAO {
    async listBySection(sectionId) {
        return await prisma.product_section_categories.findMany({
            where: { section_id: parseInt(sectionId) },
            select: { category_id: true, created_at: true },
            orderBy: { created_at: 'asc' }
        });
    }

    // Idempotent: relies on @@unique([section_id, category_id]); existing rows are left untouched.
    async addMany(mappings) {
        if (!mappings.length) return [];
        await prisma.product_section_categories.createMany({
            data: mappings.map((m) => ({ section_id: m.section_id, category_id: m.category_id })),
            skipDuplicates: true,
        });
        return await prisma.product_section_categories.findMany({
            where: { OR: mappings.map((m) => ({ section_id: m.section_id, category_id: m.category_id })) },
            orderBy: { id: 'asc' },
        });
    }

    async sync(sectionId, categoryIds) {
        return await prisma.$transaction(async (tx) => {
            // Delete all existing mappings for this section
            await tx.product_section_categories.deleteMany({
                where: { section_id: parseInt(sectionId) }
            });

            // Insert new mappings
            if (categoryIds && categoryIds.length > 0) {
                await tx.product_section_categories.createMany({
                    data: categoryIds.map(catId => ({
                        section_id: parseInt(sectionId),
                        category_id: String(catId)
                    })),
                    skipDuplicates: true
                });
            }
            return true;
        });
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
