import prisma from '../utils/prisma.js';

class CertificationDAO {
    async create(data) {
        return await prisma.certifications.create({ data });
    }

    async list(activeOnly = true) {
        return await prisma.certifications.findMany({
            where: activeOnly ? { active: true } : {},
            orderBy: { sort_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.certifications.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.certifications.delete({ where: { id } });
    }
}

export default new CertificationDAO();
