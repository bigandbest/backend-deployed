import contactQueryDAO from "../dao/contact-query.dao.js";

// Submit a new contact query
export const submitQuery = async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        if (!name || !message) {
            return res.status(400).json({
                success: false,
                message: "Name and message are required."
            });
        }

        const data = await contactQueryDAO.create({
            name,
            email: email ? String(email) : null,
            phone,
            subject,
            message,
            status: 'Pending'
        });

        res.status(201).json({
            success: true,
            message: "Query submitted successfully.",
            data
        });

    } catch (error) {
        console.error("Unexpected error in submitQuery:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};

// Get all queries (Admin)
export const getAllQueries = async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        
        const result = await contactQueryDAO.list(
            { status },
            { page: parseInt(page), limit: parseInt(limit) }
        );

        res.status(200).json({
            success: true,
            data: result.items,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: Math.ceil(result.total / result.limit)
            }
        });

    } catch (error) {
        console.error("Unexpected error in getAllQueries:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};

// Update query status (Admin)
export const updateQueryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: "Status is required"
            });
        }

        const data = await contactQueryDAO.updateStatus(id, status);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Query not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Status updated successfully",
            data
        });

    } catch (error) {
        console.error("Error in updateQueryStatus:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Delete query (Admin)
export const deleteQuery = async (req, res) => {
    try {
        const { id } = req.params;

        await contactQueryDAO.delete(id);

        res.status(200).json({
            success: true,
            message: "Query deleted successfully."
        });

    } catch (error) {
        console.error("Unexpected error in deleteQuery:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};
