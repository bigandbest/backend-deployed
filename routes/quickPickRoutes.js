import express from "express";
import multer from "multer";
import {
    addQuickPick,
    updateQuickPick,
    deleteQuickPick,
    getAllQuickPicks,
    getQuickPickById,
    addQuickPickGroup,
    mapQuickPickToGroup,
    updateQuickPickGroup,
    deleteQuickPickGroup,
    getAllQuickPickGroups,
    getQuickPickGroupById,
    getGroupsByQuickPickId,
    mapProductToQuickPickGroup,
    removeProductFromQuickPickGroup,
    getQuickPickGroupsForProduct,
    getProductsForQuickPickGroup,
    bulkMapByNames
} from '../controller/quickPickController.js'

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- Quick Pick Routes ---
router.post('/add', upload.single("image_url"), addQuickPick);
router.put('/update/:id', upload.single("image_url"), updateQuickPick);
router.delete('/delete/:id', deleteQuickPick);
router.get('/list', getAllQuickPicks);
router.get('/:id', getQuickPickById);

// --- Quick Pick Group Routes ---
router.post("/group/add", upload.any(), addQuickPickGroup);
router.post("/group/map-quick-pick", upload.none(), mapQuickPickToGroup);
router.put("/group/update/:id", upload.any(), updateQuickPickGroup);
router.delete("/group/delete/:id", deleteQuickPickGroup);
router.get("/group/list", getAllQuickPickGroups);
router.get("/group/:id", getQuickPickGroupById);
router.get("/group/by-quick-pick/:quickPickId", getGroupsByQuickPickId);

// --- Quick Pick Group Product Mapping Routes ---
router.post("/product/map", mapProductToQuickPickGroup);
router.delete("/product/remove", removeProductFromQuickPickGroup);
router.get("/product/getGroupsByProduct/:product_id", getQuickPickGroupsForProduct);
router.get("/product/getProductsByGroup/:quick_pick_group_id", getProductsForQuickPickGroup);
router.post("/product/bulk-map", bulkMapByNames);

export default router;