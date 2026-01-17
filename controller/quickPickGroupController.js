import { supabase } from "../config/supabaseClient.js";
import quickPickGroupDao from "../dao/quick-pick-group.dao.js";
import quickPickDao from "../dao/quick-pick.dao.js";

// Helper function to upload an image to Supabase Storage
async function uploadImage(file, bucketName) {
  const fileExt = file.originalname.split(".").pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return urlData.publicUrl;
}

// Add a new Quick Pick Group and optionally map a Quick Pick to it
export async function addQuickPickGroup(req, res) {
  try {
    // Destructure name and quick_pick_id from the request body
    const { name, quick_pick_id } = req.body;
    let imageUrl = null;

    // Find the image file from req.files
    const imageFile = req.files ? req.files.find(file => file.fieldname === 'image_url') : null;

    if (imageFile) {
      imageUrl = await uploadImage(imageFile, "quickPickGroup");
    }

    // Check if the quick pick exists if quick_pick_id is provided
    if (quick_pick_id) {
      const quickPickData = await quickPickDao.getById(quick_pick_id);
      if (!quickPickData) {
        return res.status(404).json({ success: false, error: "Quick Pick not found." });
      }
    }

    const data = await quickPickGroupDao.create({ name, image_url: imageUrl, quick_pick_id });
    res.status(201).json({ success: true, quickPickGroup: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Map a Quick Pick to a Quick Pick Group
export async function mapQuickPickToGroup(req, res) {
  try {
    const { groupId, quickPickId } = req.body;

    // Check if the group and quick pick exist
    const groupData = await quickPickGroupDao.getById(groupId);
    if (!groupData) return res.status(404).json({ success: false, error: "Quick Pick Group not found." });

    const quickPickData = await quickPickDao.getById(quickPickId);
    if (!quickPickData) return res.status(404).json({ success: false, error: "Quick Pick not found." });

    // Update the quick pick group with the foreign key
    const data = await quickPickGroupDao.update(groupId, { quick_pick_id: quickPickId });

    res.status(200).json({ success: true, message: "Quick Pick mapped to group successfully.", quickPickGroup: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Update a Quick Pick Group
export async function updateQuickPickGroup(req, res) {
  try {
    const { id } = req.params;
    const { name, quick_pick_id } = req.body;
    let updateData = { name };

    // Find the image file from req.files
    const imageFile = req.files ? req.files.find(file => file.fieldname === 'image_url') : null;

    if (imageFile) {
      const imageUrl = await uploadImage(imageFile, "quickPickGroup");
      updateData.image_url = imageUrl;
    }

    if (quick_pick_id) {
      updateData.quick_pick_id = quick_pick_id;
    }

    const data = await quickPickGroupDao.update(id, updateData);

    res.status(200).json({ success: true, quickPickGroup: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete a Quick Pick Group
export async function deleteQuickPickGroup(req, res) {
  try {
    const { id } = req.params;
    await quickPickGroupDao.delete(id);

    res.status(204).json({ success: true, message: "Quick Pick Group deleted successfully." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Get all Quick Pick Groups
export async function getAllQuickPickGroups(req, res) {
  try {
    const data = await quickPickGroupDao.listAll();

    res.status(200).json({ success: true, quickPickGroups: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Get one Quick Pick Group by ID
export async function getQuickPickGroupById(req, res) {
  try {
    const { id } = req.params;
    const data = await quickPickGroupDao.getById(id);

    if (!data) return res.status(404).json({ success: false, error: "Quick Pick Group not found." });

    res.status(200).json({ success: true, quickPickGroup: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Get all Quick Pick Groups for a specific Quick Pick
export async function getGroupsByQuickPickId(req, res) {
  try {
    const { quickPickId } = req.params;
    const data = await quickPickGroupDao.listByQuickPick(quickPickId);

    res.status(200).json({ success: true, quickPickGroups: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}