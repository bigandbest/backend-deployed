import ChargeSettingDAO from "../dao/charge-setting.dao.js";

/**
 * Get charge settings (singleton - always returns one row)
 */
export const getChargeSettings = async (req, res) => {

    try {
        const data = await ChargeSettingDAO.get();

        // If no settings exist, return defaults
        if (!data) {
            return res.status(200).json({
                success: true,
                data: {
                    id: 1,
                    handling_charge: 0,
                    surge_charge: 0,
                    platform_charge: 0,
                },
            });
        }

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("Error fetching charge settings:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch charge settings",
            message: error.message,
        });
    }
};

/**
 * Update charge settings
 */
export const updateChargeSettings = async (req, res) => {
    try {
        const { handling_charge, surge_charge, platform_charge } = req.body;

        // Validation - at least one field must be provided
        if (
            handling_charge === undefined &&
            surge_charge === undefined &&
            platform_charge === undefined
        ) {
            return res.status(400).json({
                success: false,
                error: "At least one charge field must be provided",
            });
        }

        // Validate non-negative values
        if (handling_charge !== undefined && handling_charge < 0) {
            return res.status(400).json({
                success: false,
                error: "handling_charge must be greater than or equal to 0",
            });
        }

        if (surge_charge !== undefined && surge_charge < 0) {
            return res.status(400).json({
                success: false,
                error: "surge_charge must be greater than or equal to 0",
            });
        }

        if (platform_charge !== undefined && platform_charge < 0) {
            return res.status(400).json({
                success: false,
                error: "platform_charge must be greater than or equal to 0",
            });
        }

        // Build update object
        const updateData = {};
        if (handling_charge !== undefined) updateData.handling_charge = handling_charge;
        if (surge_charge !== undefined) updateData.surge_charge = surge_charge;
        if (platform_charge !== undefined) updateData.platform_charge = platform_charge;

        // Update or insert (upsert)
        // Update or insert (upsert) using DAO
        const data = await ChargeSettingDAO.update(updateData);



        res.status(200).json({
            success: true,
            data,
            message: "Charge settings updated successfully",
        });
    } catch (error) {
        console.error("Error updating charge settings:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update charge settings",
            message: error.message,
        });
    }
};
