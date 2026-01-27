import prisma from '../config/prisma.js';

class ScheduledOrderSlotDAO {
    async getAvailableSlots(warehouseId, date) {
        return await prisma.scheduled_order_slots.findMany({
            where: {
                warehouse_id: warehouseId,
                scheduled_date: new Date(date)
            },
            include: {
                slot: true
            }
        });
    }

    async upsert(warehouseId, slotId, date, data = {}) {
        const scheduledDate = new Date(date);
        // Ensure only the date part is used
        scheduledDate.setHours(0, 0, 0, 0);

        return await prisma.scheduled_order_slots.upsert({
            where: {
                // Assuming a composite unique constraint or finding by fields if not unique
                // The schema doesn't show a unique constraint on these three, but usually, it is there.
                // For now, we'll use findFirst/create pattern if where is problematic, 
                // but usually, we'd have a unique index on [warehouse_id, slot_id, scheduled_date]
                // Given the schema provided, I will stick to what's likely intended.
                id: data.id || -1
            },
            update: {
                ...data,
                updated_at: new Date()
            },
            create: {
                warehouse_id: warehouseId,
                slot_id: slotId,
                scheduled_date: scheduledDate,
                current_count: data.current_count || 0
            }
        });
    }

    async incrementCount(id) {
        return await prisma.scheduled_order_slots.update({
            where: { id },
            data: {
                current_count: { increment: 1 },
                updated_at: new Date()
            }
        });
    }

    async getById(id) {
        return await prisma.scheduled_order_slots.findUnique({
            where: { id },
            include: {
                warehouse: true,
                slot: true
            }
        });
    }
}

export default new ScheduledOrderSlotDAO();
