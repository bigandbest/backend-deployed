import express from "express";
import multer from "multer";
import {
    addBrand,
    editBrand,
    deleteBrand,
    getAllBrands,
    getSingleBrand
} from '../controller/brandController.js'
import { cacheMiddleware } from "../utils/cache.js";
import { invalidateCacheMiddleware } from "../utils/cacheInvalidation.js";

const router = express.Router();
const upload = multer();

router.post('/add', invalidateCacheMiddleware('brands'), upload.single("image_url"), addBrand);
router.put('/update/:id', invalidateCacheMiddleware('brands'), upload.single("image_url"), editBrand);
router.delete('/delete/:id', invalidateCacheMiddleware('brands'), deleteBrand);

// Cache for 1 hour - brands rarely change
router.get('/', cacheMiddleware(3600), getAllBrands);
router.get('/list', cacheMiddleware(3600), getAllBrands);
router.get('/:id', cacheMiddleware(3600), getSingleBrand);

export default router;