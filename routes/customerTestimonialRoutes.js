import express from "express";
import {
    getAllTestimonials,
    getActiveTestimonials,
    addTestimonial,
    updateTestimonial,
    deleteTestimonial,
    toggleTestimonialStatus,
} from "../controller/customerTestimonialController.js";

const router = express.Router();

// Get all testimonials (admin)
router.get("/list", getAllTestimonials);

// Get active testimonials only (frontend)
router.get("/active", getActiveTestimonials);

// Add new testimonial
router.post("/add", addTestimonial);

// Update testimonial
router.put("/update/:id", updateTestimonial);

// Delete testimonial
router.delete("/delete/:id", deleteTestimonial);

// Toggle testimonial status
router.patch("/toggle-status/:id", toggleTestimonialStatus);

export default router;
