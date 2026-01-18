import prisma from '../config/prisma.js';

class StoreSectionMappingDAO {
    async listAll() {
        return await prisma.store_section_mappings.findMany({
            include: {
                recommended_store: true,
                product_sections: true,
                products: true
            }
        });
    }

    async createMany(mappings) {
        return await prisma.store_section_mappings.createMany({
            data: mappings
        });
    }

    async updateStatus(id, is_active) {
        return await prisma.store_section_mappings.update({
            where: { id: Number(id) },
            data: { is_active }
        });
    }

    async delete(id) {
        return await prisma.store_section_mappings.delete({
            where: { id: Number(id) }
        });
    }

    async deleteByStoreMapping(storeId) {
        return await prisma.store_section_mappings.deleteMany({
            where: {
                store_id: storeId,
                mapping_type: 'store_section'
            }
        });
    }

    async deleteBySectionMapping(sectionId) {
        return await prisma.store_section_mappings.deleteMany({
            where: {
                section_id: Number(sectionId),
                mapping_type: 'section_product'
            }
        });
    }

    async getProductsBySection(sectionId) {
        return await prisma.store_section_mappings.findMany({
            where: {
                section_id: Number(sectionId),
                mapping_type: 'section_product',
                is_active: true
            },
            include: {
                products: true
            }
        });
    }

    async getStoresBySection(sectionId) {
        return await prisma.store_section_mappings.findMany({
            where: {
                section_id: Number(sectionId),
                mapping_type: 'store_section',
                is_active: true
            },
            select: { store_id: true }
        });
    }
}

export default new StoreSectionMappingDAO();
