import prisma from '../config/prisma.js';

class ProductSectionCategoryDAO {
    async listBySection(sectionId) {
        return await prisma.$queryRaw`
            SELECT category_id, created_at 
            FROM product_section_categories 
            WHERE section_id = ${sectionId} 
            ORDER BY created_at ASC
        `;
    }

    async addMany(mappings) {
        // Since we need to handle upsert with onConflict, and prisma.$queryRaw 
        // doesn't have a simple helper for multiple records upsert, 
        // we'll loop or use a more complex SQL. For a small number of mappings, individual upserts are fine.
        const results = [];
        for (const mapping of mappings) {
            const result = await prisma.$queryRaw`
                INSERT INTO product_section_categories (section_id, category_id)
                VALUES (${mapping.section_id}, ${mapping.category_id})
                ON CONFLICT (section_id, category_id) DO NOTHING
                RETURNING *
            `;
            if (result.length > 0) results.push(result[0]);
        }
        return results;
    }

    async remove(sectionId, categoryId) {
        return await prisma.$queryRaw`
            DELETE FROM product_section_categories 
            WHERE section_id = ${sectionId} AND category_id = ${categoryId}
        `;
    }

    async listByProductCategory(categoryId) {
        // This involves a join with product_sections
        return await prisma.$queryRaw`
            SELECT 
                psc.id, 
                psc.created_at,
                ps.id as section_id,
                ps.section_key,
                ps.section_name,
                ps.is_active,
                ps.component_name
            FROM product_section_categories psc
            JOIN product_sections ps ON psc.section_id = ps.id
            WHERE psc.category_id = ${categoryId}
            ORDER BY psc.created_at ASC
        `;
    }
}

export default new ProductSectionCategoryDAO();
