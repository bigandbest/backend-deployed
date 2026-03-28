// controller/customerAddressController.js
// Customer delivery address management with background geocoding.
import prisma from '../config/prisma.js';
import { geocodeAddress, buildAddressString } from '../utils/geocode.js';

/**
 * POST /api/customer/addresses
 * Body: { label?, addressLine1, addressLine2?, city, state, pincode, isDefault? }
 */
export const saveAddress = async (req, res) => {
    try {
        const { label, addressLine1, addressLine2, city, state, pincode, isDefault } = req.body;

        if (!addressLine1 || !city || !state || !pincode) {
            return res.status(400).json({
                success: false,
                error: 'addressLine1, city, state, and pincode are required',
            });
        }

        if (isDefault) {
            await prisma.customer_addresses.updateMany({
                where: { user_id: req.user.id },
                data: { is_default: false },
            });
        }

        const address = await prisma.customer_addresses.create({
            data: {
                user_id: req.user.id,
                label: label || 'Other',
                address_line1: addressLine1,
                address_line2: addressLine2 || null,
                city,
                state,
                pincode,
                is_default: !!isDefault,
                geocode_status: 'PENDING',
            },
        });

        res.status(201).json({ success: true, data: address });

        // Background geocoding — never blocks response
        setImmediate(async () => {
            try {
                const addressString = buildAddressString({ addressLine1, addressLine2, city, state, pincode });
                const geo = await geocodeAddress(addressString);

                if (geo) {
                    await prisma.customer_addresses.update({
                        where: { id: address.id },
                        data: {
                            latitude: geo.latitude,
                            longitude: geo.longitude,
                            geocode_source: geo.source,
                            geocode_status: 'SUCCESS',
                            geocoded_at: new Date(),
                            geocoded_display_name: geo.display_name,
                            updated_at: new Date(),
                        },
                    });
                } else {
                    await prisma.customer_addresses.update({
                        where: { id: address.id },
                        data: { geocode_status: 'FAILED', updated_at: new Date() },
                    });
                    await prisma.geocode_retry_queue.create({
                        data: {
                            entity_type: 'CUSTOMER_ADDRESS',
                            entity_id: String(address.id),
                            address_string: buildAddressString({ addressLine1, addressLine2, city, state, pincode }),
                        },
                    });
                }
            } catch (err) {
                console.error('[customerAddress] Background geocode failed:', err.message);
            }
        });
    } catch (err) {
        console.error('saveAddress error:', err);
        res.status(500).json({ success: false, error: 'Failed to save address' });
    }
};

/**
 * GET /api/customer/addresses
 */
export const listAddresses = async (req, res) => {
    try {
        const addresses = await prisma.customer_addresses.findMany({
            where: { user_id: req.user.id },
            orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
        });
        res.status(200).json({ success: true, data: addresses });
    } catch (err) {
        console.error('listAddresses error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch addresses' });
    }
};

/**
 * PATCH /api/customer/addresses/:id
 */
export const updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { addressLine1, addressLine2, city, state, pincode, label } = req.body;

        const existing = await prisma.customer_addresses.findFirst({
            where: { id: parseInt(id), user_id: req.user.id },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Address not found' });

        const updated = await prisma.customer_addresses.update({
            where: { id: parseInt(id) },
            data: {
                ...(label !== undefined && { label }),
                ...(addressLine1 !== undefined && { address_line1: addressLine1 }),
                ...(addressLine2 !== undefined && { address_line2: addressLine2 }),
                ...(city !== undefined && { city }),
                ...(state !== undefined && { state }),
                ...(pincode !== undefined && { pincode }),
                geocode_status: 'PENDING',
                updated_at: new Date(),
            },
        });

        res.status(200).json({ success: true, data: updated });

        // Re-geocode in background
        setImmediate(async () => {
            try {
                const line1 = addressLine1 || existing.address_line1;
                const line2 = addressLine2 ?? existing.address_line2;
                const c = city || existing.city;
                const s = state || existing.state;
                const p = pincode || existing.pincode;

                const addressString = buildAddressString({ addressLine1: line1, addressLine2: line2, city: c, state: s, pincode: p });
                const geo = await geocodeAddress(addressString);

                if (geo) {
                    await prisma.customer_addresses.update({
                        where: { id: parseInt(id) },
                        data: {
                            latitude: geo.latitude,
                            longitude: geo.longitude,
                            geocode_source: geo.source,
                            geocode_status: 'SUCCESS',
                            geocoded_at: new Date(),
                            geocoded_display_name: geo.display_name,
                            updated_at: new Date(),
                        },
                    });
                } else {
                    await prisma.customer_addresses.update({
                        where: { id: parseInt(id) },
                        data: { geocode_status: 'FAILED', updated_at: new Date() },
                    });
                }
            } catch (err) {
                console.error('[customerAddress] Re-geocode failed:', err.message);
            }
        });
    } catch (err) {
        console.error('updateAddress error:', err);
        res.status(500).json({ success: false, error: 'Failed to update address' });
    }
};

/**
 * DELETE /api/customer/addresses/:id
 */
export const deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.customer_addresses.findFirst({
            where: { id: parseInt(id), user_id: req.user.id },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Address not found' });

        await prisma.customer_addresses.delete({ where: { id: parseInt(id) } });

        res.status(200).json({ success: true, message: 'Address deleted' });
    } catch (err) {
        console.error('deleteAddress error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete address' });
    }
};

/**
 * POST /api/customer/addresses/:id/default
 */
export const setDefault = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.customer_addresses.findFirst({
            where: { id: parseInt(id), user_id: req.user.id },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Address not found' });

        await prisma.$transaction([
            prisma.customer_addresses.updateMany({
                where: { user_id: req.user.id },
                data: { is_default: false },
            }),
            prisma.customer_addresses.update({
                where: { id: parseInt(id) },
                data: { is_default: true, updated_at: new Date() },
            }),
        ]);

        res.status(200).json({ success: true, message: 'Default address updated' });
    } catch (err) {
        console.error('setDefault error:', err);
        res.status(500).json({ success: false, error: 'Failed to set default address' });
    }
};

/**
 * Utility used by order placement:
 * Copies GPS from a saved address into the order record.
 */
export async function attachGpsToOrder(orderId, customerAddressId) {
    const addr = await prisma.customer_addresses.findUnique({
        where: { id: customerAddressId },
        select: { latitude: true, longitude: true },
    });
    if (addr?.latitude && addr?.longitude) {
        await prisma.orders.update({
            where: { id: orderId },
            data: {
                delivery_latitude: addr.latitude,
                delivery_longitude: addr.longitude,
                customer_address_id: customerAddressId,
                updated_at: new Date(),
            },
        });
    }
}
