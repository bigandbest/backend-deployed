import CertificationDAO from "../dao/certification.dao.js";

// Get all certifications (for admin)
export const getAllCertifications = async (req, res) => {
    try {
        const data = await CertificationDAO.listCertifications(false);

        res.status(200).json({ success: true, certifications: data });
    } catch (err) {
        console.error("Error fetching certifications:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get active certifications (for frontend)
export const getActiveCertifications = async (req, res) => {
    try {
        const data = await CertificationDAO.listCertifications(true);

        res.status(200).json({ success: true, certifications: data });
    } catch (err) {
        console.error("Error fetching active certifications:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Add certification
export const addCertification = async (req, res) => {
    try {
        const { name, description, active, sort_order } = req.body;
        const imageFile = req.file;

        if (!name || !imageFile) {
            return res.status(400).json({ success: false, error: "Name and Image are required" });
        }

        // Upload image
        const fileExt = imageFile.originalname.split(".").pop();
        const fileName = `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
            .from("addBanner")
            .upload(fileName, imageFile.buffer, {
                contentType: imageFile.mimetype,
                upsert: true,
            });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from("addBanner").getPublicUrl(fileName);
        const image_url = urlData.publicUrl;

        const data = await CertificationDAO.createCertification({
            name,
            image_url,
            description,
            active: active === 'true' || active === true,
            sort_order: parseInt(sort_order || 0)
        });



        res.status(201).json({ success: true, certification: data });
    } catch (err) {
        console.error("Error adding certification:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update certification
export const updateCertification = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, active, sort_order } = req.body;
        const imageFile = req.file;

        const updates = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (active !== undefined) updates.active = active === 'true' || active === true;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        if (imageFile) {
            const fileExt = imageFile.originalname.split(".").pop();
            const fileName = `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from("addBanner")
                .upload(fileName, imageFile.buffer, {
                    contentType: imageFile.mimetype,
                    upsert: true,
                });

            if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

            const { data: urlData } = supabase.storage.from("addBanner").getPublicUrl(fileName);
            updates.image_url = urlData.publicUrl;
        }

        const data = await CertificationDAO.updateCertification(id, updates);



        res.status(200).json({ success: true, certification: data });
    } catch (err) {
        console.error("Error updating certification:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Delete certification
export const deleteCertification = async (req, res) => {
    try {
        const { id } = req.params;
        await CertificationDAO.deleteCertification(id);

        res.status(200).json({ success: true, message: "Certification deleted successfully" });
    } catch (err) {
        console.error("Error deleting certification:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};
