import express from "express";
import {
  getLists,
  createList,
  renameList,
  deleteList,
  addItem,
  removeItem,
  updateItemQuantity,
  syncLists,
} from "../controller/shoppingListController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// All routes require auth
router.use(authenticateToken);

// List operations
router.get("/", getLists);
router.post("/", createList);
router.put("/:listId", renameList);
router.delete("/:listId", deleteList);

// Item operations
router.post("/:listId/items", addItem);
router.delete("/:listId/items/:itemId", removeItem);
router.patch("/:listId/items/:itemId", updateItemQuantity);

// Sync from localStorage on login
router.post("/sync", syncLists);

export default router;
