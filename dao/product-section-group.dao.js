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
            select: {
                id: true,
                section_id: true,
                group_id: true,
                is_active: true,
                groups: { select: { id: true, name: true, image_url: true } },
                product_sections: { select: { id: true, section_name: true, section_key: true } }
            },
            orderBy: [{ section_id: 'asc' }, { display_order: 'asc' }, { id: 'asc' }]
        });
    }

    async create(data) {
        return await prisma.product_section_groups.create({
            data
        });
    }

    async createMany(mappings) {
        // Single batched insert (returns only newly created rows); the (section_id, group_id) unique key makes it idempotent
        return await prisma.product_section_groups.createManyAndReturn({
            data: mappings.map((m) => ({
                section_id: Number(m.section_id),
                group_id: m.group_id
            })),
            skipDuplicates: true
        });
    }

    // Make the section's groups exactly `groupIds` in one transaction.
    // Groups that stay mapped keep their is_active / display_order.
    async syncBySection(sectionId, groupIds) {
        const section_id = Number(sectionId);
        return await prisma.$transaction(async (tx) => {
            const removed = await tx.product_section_groups.deleteMany({
                where: { section_id, group_id: { notIn: groupIds } }
            });
            const added = await tx.product_section_groups.createMany({
                data: groupIds.map((group_id) => ({ section_id, group_id })),
                skipDuplicates: true
            });
            return { removed: removed.count, added: added.count };
        });
    }

    async updateStatusBySection(sectionId, is_active) {
        return await prisma.product_section_groups.updateMany({
            where: { section_id: Number(sectionId) },
            data: { is_active }
        });
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
