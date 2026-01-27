import prisma from '../config/prisma.js';

class VariantAttributeDAO {
    async upsert(variantId, name, value) {
        return await prisma.variant_attributes.upsert({
            where: {
                variant_id_attribute_name: {
                    variant_id: variantId,
                    attribute_name: name
                }
            },
            update: {
                attribute_value: value
            },
            create: {
                variant_id: variantId,
                attribute_name: name,
                attribute_value: value
            }
        });
    }

    async listByVariant(variantId) {
        return await prisma.variant_attributes.findMany({
            where: { variant_id: variantId }
        });
    }

    async delete(variantId, name) {
        return await prisma.variant_attributes.delete({
            where: {
                variant_id_attribute_name: {
                    variant_id: variantId,
                    attribute_name: name
                }
            }
        });
    }

    async deleteAllForVariant(variantId) {
        return await prisma.variant_attributes.deleteMany({
            where: { variant_id: variantId }
        });
    }
}

export default new VariantAttributeDAO();
