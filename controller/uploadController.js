import { supabase } from '../config/supabaseClient.js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Only 1 file at a time
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  }
});

// Upload image to Supabase Storage
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const file = req.file;
    
    // Validate file size (additional check)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 5MB allowed.'
      });
    }

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${Date.now()}_${uuidv4().substring(0, 8)}.${fileExtension}`;
    const filePath = `variant-images/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
        cacheControl: '3600'
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image to storage',
        error: error.message
      });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    if (!publicUrl) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate public URL'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: publicUrl,
      fileName: fileName,
      fileSize: file.size
    });

  } catch (error) {
    console.error('Upload controller error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during upload',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const uploadMiddleware = upload.single('image');