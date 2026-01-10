import { supabase } from "../config/supabaseClient.js";

// Submit a new contact query
export const submitQuery = async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        // Basic validation
        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and message are required."
            });
        }

        const { data, error } = await supabase
            .from("contact_queries")
            .insert([
                {
                    name,
                    email,
                    phone,
                    subject,
                    message,
                    status: 'Pending'
                }
            ])
            .select();

        if (error) {
            console.error("Error submitting contact query:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to submit query. Please try again later.",
                error: error.message
            });
        }

        res.status(201).json({
            success: true,
            message: "Query submitted successfully.",
            data: data[0]
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
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        let query = supabase
            .from("contact_queries")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(start, end);

        if (status) {
            query = query.eq("status", status);
        }

        const { data, count, error } = await query;

        if (error) {
            console.error("Error fetching contact queries:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch queries.",
                error: error.message
            });
        }

        res.status(200).json({
            success: true,
            data: data,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(count / limit)
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

        const { data, error } = await supabase
            .from("contact_queries")
            .update({ status, updated_at: new Date() })
            .eq("id", id)
            .select();

        if (error) {
            console.error("Error updating query status:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update status.",
                error: error.message
            });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Query not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Status updated successfully",
            data: data[0]
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

        const { error } = await supabase
            .from("contact_queries")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("Error deleting contact query:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to delete query.",
                error: error.message
            });
        }

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
