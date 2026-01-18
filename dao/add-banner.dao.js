import prisma from '../config/prisma.js';

class AddBannerDAO {
    async create(data) {
        return await prisma.add_banner.create({ data });
    }

    async getById(id) {
        return await prisma.add_banner.findUnique({
            where: { id }
        });
    }

    async list(activeOnly = false) {
        return await prisma.add_banner.findMany({
            where: activeOnly ? { active: true } : {},
            orderBy: { updated_at: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.add_banner.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.add_banner.delete({ where: { id } });
    }

    async getByType(bannerType) {
        return await prisma.add_banner.findMany({
            where: { banner_type: bannerType }
        });
    }
}

export default new AddBannerDAO();
