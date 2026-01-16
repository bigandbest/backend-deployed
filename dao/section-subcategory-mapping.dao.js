import prisma from '../utils/prisma.js';

class SectionSubcategoryMappingDAO {
    async link(sectionId, subcategoryId, displayOrder = 0) {
        return await prisma.section_subcategory_mappings.create({
            data: {
                section_id: sectionId,
                subcategory_id: subcategoryId,
                display_order: displayOrder
            }
        });
    }

    async unlink(id) {
        return await prisma.section_subcategory_mappings.delete({
            where: { id }
        });
    }

    async listBySection(sectionId, activeOnly = true) {
        return await prisma.section_subcategory_mappings.findMany({
            where: {
                section_id: sectionId,
                ...(activeOnly && { is_active: true })
            },
            include: {
                subcategory: true
            },
            orderBy: {
                display_order: 'asc'
            }
        });
    }

    async update(id, data) {
        return await prisma.section_subcategory_mappings.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async getById(id) {
        return await prisma.section_subcategory_mappings.findUnique({
            where: { id },
            include: {
                section: true,
                subcategory: true
            }
        });
    }
}

export default new SectionSubcategoryMappingDAO();
