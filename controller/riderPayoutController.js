import prisma from '../config/prisma.js';

// ============ CREATE MILESTONE ============
export const createMilestone = async (req, res) => {
    try {
        const { min_order_value, max_order_value, base_pay_per_km } = req.body;

        if (min_order_value === undefined || max_order_value === undefined || base_pay_per_km === undefined) {
            return res.status(400).json({ success: false, error: 'All fields are required.' });
        }

        const milestone = await prisma.rider_payout_milestones.create({
            data: {
                min_order_value,
                max_order_value,
                base_pay_per_km,
            }
        });

        res.status(201).json({ success: true, data: milestone });
    } catch (error) {
        console.error('Create milestone error:', error);
        res.status(500).json({ success: false, error: 'Failed to create payout milestone' });
    }
};

// ============ GET ALL MILESTONES ============
export const getMilestones = async (req, res) => {
    try {
        const milestones = await prisma.rider_payout_milestones.findMany({
            orderBy: { min_order_value: 'asc' }
        });

        res.status(200).json({ success: true, data: milestones });
    } catch (error) {
        console.error('Get milestones error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch payout milestones' });
    }
};

// ============ UPDATE MILESTONE ============
export const updateMilestone = async (req, res) => {
    try {
        const { id } = req.params;
        const { min_order_value, max_order_value, base_pay_per_km } = req.body;

        const updated = await prisma.rider_payout_milestones.update({
            where: { id },
            data: {
                min_order_value,
                max_order_value,
                base_pay_per_km,
                updated_at: new Date(),
            }
        });

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        console.error('Update milestone error:', error);
        res.status(500).json({ success: false, error: 'Failed to update payout milestone' });
    }
};

// ============ DELETE MILESTONE ============
export const deleteMilestone = async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.rider_payout_milestones.delete({ where: { id } });

        res.status(200).json({ success: true, message: 'Milestone deleted successfully' });
    } catch (error) {
        console.error('Delete milestone error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete payout milestone' });
    }
};
