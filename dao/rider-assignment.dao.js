import prisma from '../config/prisma.js';

class RiderAssignmentDAO {
    /**
     * Create a new rider assignment for an order
     */
    async create(data) {
        return await prisma.rider_assignments.create({
            data: {
                rider_id: data.rider_id,
                order_id: data.order_id,
                pickup_sequence: data.pickup_sequence || [],
                pickup_status: data.pickup_status || {},
                status: 'assigned',
            },
        });
    }

    /**
     * Get the active assignment for an order
     */
    async getActiveByOrderId(orderId) {
        return await prisma.rider_assignments.findFirst({
            where: {
                order_id: orderId,
                status: { in: ['assigned', 'in_progress'] },
            },
            include: {
                rider: {
                    include: {
                        user: {
                            select: { id: true, name: true, phone: true },
                        },
                    },
                },
            },
            orderBy: { assigned_at: 'desc' },
        });
    }

    /**
     * Get assignment by ID
     */
    async getById(id) {
        return await prisma.rider_assignments.findUnique({
            where: { id },
            include: {
                rider: {
                    include: {
                        user: {
                            select: { id: true, name: true, phone: true },
                        },
                    },
                },
                order: {
                    select: { id: true, address: true, delivery_pincode: true },
                },
            },
        });
    }

    /**
     * Update assignment status
     */
    async updateStatus(id, status, additionalData = {}) {
        return await prisma.rider_assignments.update({
            where: { id },
            data: {
                status,
                ...(status === 'completed' ? { completed_at: new Date() } : {}),
                ...additionalData,
            },
        });
    }

    /**
     * Mark a pickup stop as done (preserves state for rider reassignment)
     */
    async markPickupDone(id, stopIndex) {
        const assignment = await prisma.rider_assignments.findUnique({
            where: { id },
        });

        if (!assignment) throw new Error('Rider assignment not found');

        const pickupStatus = assignment.pickup_status || {};
        pickupStatus[`stop_${stopIndex}`] = {
            picked_up: true,
            picked_at: new Date().toISOString(),
        };

        return await prisma.rider_assignments.update({
            where: { id },
            data: {
                pickup_status: pickupStatus,
                status: 'in_progress',
            },
        });
    }

    /**
     * Cancel current assignment and create a new one (rider reassignment)
     * Preserves pickup_status so the new rider knows what's already picked up 
     */
    async reassign(oldAssignmentId, newRiderId) {
        return await prisma.$transaction(async (tx) => {
            // Get old assignment with its state
            const oldAssignment = await tx.rider_assignments.findUnique({
                where: { id: oldAssignmentId },
            });

            if (!oldAssignment) throw new Error('Assignment not found');

            // Cancel old assignment
            await tx.rider_assignments.update({
                where: { id: oldAssignmentId },
                data: { status: 'reassigned' },
            });

            // Create new assignment with preserved pickup state
            const newAssignment = await tx.rider_assignments.create({
                data: {
                    rider_id: newRiderId,
                    order_id: oldAssignment.order_id,
                    pickup_sequence: oldAssignment.pickup_sequence,
                    pickup_status: oldAssignment.pickup_status, // Carry over what's already picked
                    status: 'assigned',
                },
            });

            return newAssignment;
        });
    }

    /**
     * List active assignments for a rider
     */
    async listActiveByRiderId(riderId) {
        return await prisma.rider_assignments.findMany({
            where: {
                rider_id: riderId,
                status: { in: ['assigned', 'in_progress'] },
            },
            include: {
                order: {
                    select: {
                        id: true,
                        address: true,
                        delivery_pincode: true,
                        mobile: true,
                        receiver_name: true,
                    },
                },
            },
            orderBy: { assigned_at: 'desc' },
        });
    }
}

export default new RiderAssignmentDAO();
