import prisma from '../utils/prisma.js';

class BrandDAO {
    async createBrand(data) {
        return await prisma.brand.create({
            data
        });
    }

    async getBrandById(id) {
        return await prisma.brand.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { products: true }
                }
            }
        });
    }

    async updateBrand(id, data) {
        return await prisma.brand.update({
            where: { id },
            data
        });
    }

    async deleteBrand(id) {
        return await prisma.brand.delete({
            where: { id }
        });
    }

    async listBrands(pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.brand.findMany({
                skip,
                take: limit,
                orderBy: { name: 'asc' }
            }),
            prisma.brand.count()
        ]);

        return { items, total, page, limit };
    }
}

export default new BrandDAO();
