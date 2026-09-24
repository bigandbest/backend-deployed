import contactQueryDAO from "../dao/contact-query.dao.js";

const QUERY_STATUSES = ["Pending", "Contacted", "Resolved"];
const MAX_PAGE_SIZE = 100;

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
        const { status } = req.query;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || 10));

        if (status && !QUERY_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status filter" });
        }

        const result = await contactQueryDAO.list({ status }, { page, limit });

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

        if (!QUERY_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${QUERY_STATUSES.join(", ")}`
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
        if (error.code === "P2025") {
            return res.status(404).json({ success: false, message: "Query not found" });
        }
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
        if (error.code === "P2025") {
            return res.status(404).json({ success: false, message: "Query not found" });
        }
        console.error("Unexpected error in deleteQuery:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};
