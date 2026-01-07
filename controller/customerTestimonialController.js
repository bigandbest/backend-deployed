import { supabase } from "../config/supabaseClient.js";

// Get all customer testimonials
export const getAllTestimonials = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("customer_testimonials")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        res.status(200).json({
            success: true,
            testimonials: data,
            total: data.length,
        });
    } catch (err) {
        console.error("Error fetching testimonials:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};

// Get active customer testimonials only (for frontend)
export const getActiveTestimonials = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("customer_testimonials")
            .select("*")
            .eq("active", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        res.status(200).json({
            success: true,
            testimonials: data,
            total: data.length,
        });
    } catch (err) {
        console.error("Error fetching active testimonials:", err);
        res.status(500).json({ success: false, error: "Server error" });
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

        const { data, error } = await supabase
            .from("customer_testimonials")
            .insert([
                {
                    name,
                    rating: rating || 5,
                    image_url: image_url || "",
                    comment,
                    active: active !== undefined ? active : true,
                    sort_order: sort_order || 0,
                },
            ])
            .select();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        res.status(201).json({
            success: true,
            testimonial: data[0],
            message: "Testimonial added successfully",
        });
    } catch (err) {
        console.error("Error adding testimonial:", err);
        res.status(500).json({ success: false, error: "Server error" });
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

        const updateData = {
            updated_at: new Date().toISOString(),
        };

        if (name !== undefined) updateData.name = name;
        if (rating !== undefined) updateData.rating = rating;
        if (image_url !== undefined) updateData.image_url = image_url;
        if (comment !== undefined) updateData.comment = comment;
        if (active !== undefined) updateData.active = active;
        if (sort_order !== undefined) updateData.sort_order = sort_order;

        const { data, error } = await supabase
            .from("customer_testimonials")
            .update(updateData)
            .eq("id", id)
            .select();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        if (data.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Testimonial not found",
            });
        }

        res.status(200).json({
            success: true,
            testimonial: data[0],
            message: "Testimonial updated successfully",
        });
    } catch (err) {
        console.error("Error updating testimonial:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};

// Delete customer testimonial
export const deleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from("customer_testimonials")
            .delete()
            .eq("id", id);

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        res.status(200).json({
            success: true,
            message: "Testimonial deleted successfully",
        });
    } catch (err) {
        console.error("Error deleting testimonial:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};

// Toggle testimonial active status
export const toggleTestimonialStatus = async (req, res) => {
    try {
        const { id } = req.params;

        // First get current status
        const { data: current, error: fetchError } = await supabase
            .from("customer_testimonials")
            .select("active")
            .eq("id", id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({
                success: false,
                error: "Testimonial not found",
            });
        }

        // Toggle status
        const { data, error } = await supabase
            .from("customer_testimonials")
            .update({
                active: !current.active,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .select();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        res.status(200).json({
            success: true,
            testimonial: data[0],
            message: "Testimonial status updated successfully",
        });
    } catch (err) {
        console.error("Error toggling testimonial status:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
