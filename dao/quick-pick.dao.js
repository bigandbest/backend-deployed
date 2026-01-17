import prisma from '../config/prisma.js';

class QuickPickDAO {
    async create(data) {
        return await prisma.quick_pick.create({ data });
    }

    async getById(id) {
        return await prisma.quick_pick.findUnique({
            where: { id },
            include: {
                groups: {
                    include: {
                        products: {
                            include: { product: true }
                        }
                    }
                }
            }
        });
    }

    async getByName(name) {
        return await prisma.quick_pick.findFirst({
            where: { name }
        });
    }

    async list() {
        return await prisma.quick_pick.findMany({
            include: {
                _count: {
                    select: { groups: true }
                }
            }
        });
    }

    async update(id, data) {
        return await prisma.quick_pick.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.quick_pick.delete({
            where: { id }
        });
    }
}

export default new QuickPickDAO();
