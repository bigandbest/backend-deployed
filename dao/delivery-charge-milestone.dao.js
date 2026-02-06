import prisma from '../config/prisma.js';

class DeliveryChargeMilestoneDAO {
    async create(data) {
        return await prisma.delivery_charge_milestones.create({ data });
    }

    async getById(id) {
        return await prisma.delivery_charge_milestones.findUnique({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { is_active } = filters;
        return await prisma.delivery_charge_milestones.findMany({
            where: {
                ...(is_active !== undefined && { is_active })
            },
            orderBy: {
                min_order_value: 'asc'
            }
        });
    }

    async update(id, data) {
        return await prisma.delivery_charge_milestones.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.delivery_charge_milestones.delete({
            where: { id }
        });
    }

    async getApplicableCharge(orderValue) {
        // "Upto" logic: Find the smallest milestone limit that is >= orderValue.
        // Example: Order 200. Milestones: [399, 999].
        // 399 >= 200. Match.
        // This is the "upto" bucket the order falls into.
        return await prisma.delivery_charge_milestones.findFirst({
            where: {
                is_active: true,
                min_order_value: {
                    gte: orderValue
                }
            },
            orderBy: {
                min_order_value: 'asc'
            }
        });
    }
}

export default new DeliveryChargeMilestoneDAO();
