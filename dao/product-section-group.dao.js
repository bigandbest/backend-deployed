import prisma from '../config/prisma.js';

class ProductSectionGroupDAO {
    async listBySection(sectionId) {
        return await prisma.$queryRaw`
            SELECT 
                psg.id,
                psg.section_id,
                psg.group_id,
                psg.is_active,
                g.name as group_name,
                g.image_url
            FROM product_section_groups psg
            JOIN groups g ON psg.group_id = g.id
            WHERE psg.section_id = ${sectionId}
            ORDER BY psg.created_at ASC
        `;
    }

    async listAll() {
        return await prisma.product_section_groups.findMany({
            include: {
                groups: true,
                product_sections: true
            }
        });
    }

    async create(data) {
        return await prisma.product_section_groups.create({
            data
        });
    }

    async createMany(mappings) {
        // Upsert logic for multiple mappings
        const results = [];
        for (const m of mappings) {
            const result = await prisma.$queryRaw`
               INSERT INTO product_section_groups (section_id, group_id, is_active)
               VALUES (${m.section_id}, ${m.group_id}::uuid, true)
               ON CONFLICT (section_id, group_id) DO NOTHING
               RETURNING *
           `;
            if (result.length) results.push(result[0]);
        }
        return results;
    }

    async delete(id) {
        return await prisma.product_section_groups.delete({
            where: { id: Number(id) }
        });
    }

    async deleteBySection(sectionId) {
        return await prisma.product_section_groups.deleteMany({
            where: { section_id: Number(sectionId) }
        });
    }

    async findBySectionAndGroup(sectionId, groupId) {
        return await prisma.product_section_groups.findFirst({
            where: {
                section_id: Number(sectionId),
                group_id: groupId
            }
        });
    }
}

export default new ProductSectionGroupDAO();
