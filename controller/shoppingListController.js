import ShoppingListDAO from "../dao/shoppingList.dao.js";

// GET /api/shopping-lists
export const getLists = async (req, res) => {
  try {
    const userId = req.user.id;
    const lists = await ShoppingListDAO.getAllByUser(userId);
    res.status(200).json({ success: true, lists });
  } catch (error) {
    console.error("getLists error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const createList = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: "List name is required" });
    }
    const list = await ShoppingListDAO.create(userId, name.trim(), description?.trim() || null);
    res.status(201).json({ success: true, list });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ success: false, error: "You already have a list with this name" });
    }
    console.error("createList error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// PUT /api/shopping-lists/:listId
export const renameList = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listId } = req.params;
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: "Name is required" });
    }
    const isOwner = await ShoppingListDAO.isOwner(listId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const list = await ShoppingListDAO.rename(listId, name.trim());
    res.status(200).json({ success: true, list });
  } catch (error) {
    console.error("renameList error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// DELETE /api/shopping-lists/:listId
export const deleteList = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listId } = req.params;
    const isOwner = await ShoppingListDAO.isOwner(listId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    await ShoppingListDAO.delete(listId);
    res.status(200).json({ success: true, message: "List deleted" });
  } catch (error) {
    console.error("deleteList error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// POST /api/shopping-lists/:listId/items
export const addItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listId } = req.params;
    const { productId, variantId, name, price, old_price, image, brand, weight, quantity } = req.body;
    if (!productId || !name || price === undefined) {
      return res.status(400).json({ success: false, error: "productId, name and price are required" });
    }
    const isOwner = await ShoppingListDAO.isOwner(listId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const item = await ShoppingListDAO.addItem(listId, {
      productId, variantId, name, price, old_price, image, brand, weight, quantity,
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    console.error("addItem error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// DELETE /api/shopping-lists/:listId/items/:itemId
export const removeItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listId, itemId } = req.params;
    const isOwner = await ShoppingListDAO.isOwner(listId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    await ShoppingListDAO.removeItem(itemId);
    res.status(200).json({ success: true, message: "Item removed" });
  } catch (error) {
    console.error("removeItem error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// PATCH /api/shopping-lists/:listId/items/:itemId
export const updateItemQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listId, itemId } = req.params;
    const { quantity } = req.body;
    if (!quantity || quantity < 1 || quantity > 12) {
      return res.status(400).json({ success: false, error: "Quantity must be between 1 and 12" });
    }
    const isOwner = await ShoppingListDAO.isOwner(listId, userId);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const item = await ShoppingListDAO.updateItemQuantity(itemId, quantity);
    res.status(200).json({ success: true, item });
  } catch (error) {
    console.error("updateItemQuantity error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// POST /api/shopping-lists/sync
// Merges localStorage lists (sent on login) into the user's server lists
export const syncLists = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lists: clientLists } = req.body;
    if (!Array.isArray(clientLists) || clientLists.length === 0) {
      // No lists to sync — just return existing server lists
      const lists = await ShoppingListDAO.getAllByUser(userId);
      return res.status(200).json({ success: true, lists });
    }
    await ShoppingListDAO.syncFromClient(userId, clientLists);
    const lists = await ShoppingListDAO.getAllByUser(userId);
    res.status(200).json({ success: true, lists });
  } catch (error) {
    console.error("syncLists error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
