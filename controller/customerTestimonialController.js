import testimonialDao from "../dao/testimonial.dao.js";

// Get all customer testimonials
export const getAllTestimonials = async (req, res) => {
    try {
        const data = await testimonialDao.list();

        res.status(200).json({
            success: true,
            testimonials: data,
            total: data.length,
        });
    } catch (err) {
        console.error("Error fetching testimonials:", err);
        res.status(500).json({ success: false, error: err.message || "Server error" });
    }
};

// Get active customer testimonials only (for frontend)
export const getActiveTestimonials = async (req, res) => {
    try {
        const data = await testimonialDao.list({ active: true });

        res.status(200).json({
            success: true,
            testimonials: data,
            total: data.length,
        });
    } catch (err) {
        console.error("Error fetching active testimonials:", err);
        res.status(500).json({ success: false, error: err.message || "Server error" });
    }
};

// Add new customer testimonial
export const addTestimonial = async (req, res) => {
    try {
        const { name, rating, image_url, comment, active, sort_order } = req.body;

        // Validation
        if (!name || !comment) {
            return res.status(400).json({
                success: false,
                error: "Name and comment are required",
            });
        }

        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({
                success: false,
                error: "Rating must be between 1 and 5",
            });
        }

        const data = await testimonialDao.create({
            name,
            rating: rating || 5,
            image_url: image_url || "",
            comment,
            active: active !== undefined ? active : true,
            sort_order: sort_order || 0,
        });

        res.status(201).json({
            success: true,
            testimonial: data,
            message: "Testimonial added successfully",
        });
    } catch (err) {
        console.error("Error adding testimonial:", err);
        res.status(500).json({ success: false, error: err.message || "Server error" });
    }
};

// Update customer testimonial
export const updateTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, rating, image_url, comment, active, sort_order } = req.body;

        // Validation
        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({
                success: false,
                error: "Rating must be between 1 and 5",
            });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (rating !== undefined) updateData.rating = rating;
        if (image_url !== undefined) updateData.image_url = image_url;
        if (comment !== undefined) updateData.comment = comment;
        if (active !== undefined) updateData.active = active;
        if (sort_order !== undefined) updateData.sort_order = sort_order;

        const data = await testimonialDao.update(id, updateData);

        res.status(200).json({
            success: true,
            testimonial: data,
            message: "Testimonial updated successfully",
        });
    } catch (err) {
        console.error("Error updating testimonial:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: "Testimonial not found" });
        }
        res.status(500).json({ success: false, error: err.message || "Server error" });
    }
};

// Delete customer testimonial
export const deleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;

        await testimonialDao.delete(id);

        res.status(200).json({
            success: true,
            message: "Testimonial deleted successfully",
        });
    } catch (err) {
        console.error("Error deleting testimonial:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: "Testimonial not found" });
        }
        res.status(500).json({ success: false, error: err.message || "Server error" });
    }
};

// Toggle testimonial active status
export const toggleTestimonialStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const data = await testimonialDao.toggleStatus(id);

        res.status(200).json({
            success: true,
            testimonial: data,
            message: "Testimonial status updated successfully",
        });
    } catch (err) {
        console.error("Error toggling testimonial status:", err);
        if (err.message === 'Testimonial not found' || err.code === 'P2025') {
            return res.status(404).json({ success: false, error: "Testimonial not found" });
        }
        res.status(500).json({ success: false, error: err.message || "Server error" });
    }
};
