import prisma from '../config/prisma.js';

/**
 * Assigns a rider to the correct warehouse based on their current pincode.
 * @param {string} riderId - The UUID of the rider.
 * @param {string} pincode - The postal code the rider is currently in.
 * @returns {Promise<{success: boolean, message?: string, warehouse_id?: number}>}
 */
export const assignRiderToPincode = async (riderId, pincode) => {
    try {
        if (!riderId || !pincode) {
            return { success: false, message: 'Rider ID and pincode are required' };
        }

        // 1. Find the warehouse that services this pincode
        const warehousePincode = await prisma.warehouse_pincodes.findFirst({
            where: {
                pincode: pincode,
                is_active: true
            },
            include: { warehouse: true }
        });

        if (!warehousePincode) {
            throw new Error(`We are not serviceable in this pincode: ${pincode}`);
        }

        const warehouseId = warehousePincode.warehouse_id;

        // 2. Check current active assignment
        const currentAssignment = await prisma.warehouse_riders.findFirst({
            where: {
                rider_id: riderId,
                is_active: true
            }
        });

        // 3. If already assigned to the correct warehouse, do nothing
        if (currentAssignment && currentAssignment.warehouse_id === warehouseId) {
            return { success: true, message: `Already assigned to warehouse ${warehouseId}`, warehouse_id: warehouseId };
        }

        // 4. Update assignment in a transaction
        await prisma.$transaction(async (tx) => {
            // Deactivate existing active assignments
            await tx.warehouse_riders.updateMany({
                where: {
                    rider_id: riderId,
                    is_active: true
                },
                data: {
                    is_active: false
                }
            });

            // Activate new assignment (upsert)
            await tx.warehouse_riders.upsert({
                where: {
                    warehouse_id_rider_id: {
                        warehouse_id: warehouseId,
                        rider_id: riderId
                    }
                },
                create: {
                    warehouse_id: warehouseId,
                    rider_id: riderId,
                    is_active: true,
                },
                update: {
                    is_active: true,
                    assigned_at: new Date()
                }
            });
        });

        return {
            success: true,
            message: `Successfully assigned to warehouse ${warehousePincode.warehouse.name} for pincode ${pincode}`,
            warehouse_id: warehouseId
        };

    } catch (error) {
        console.error('Error assigning rider to pincode:', error);
        return { success: false, message: error.message };
    }
};
