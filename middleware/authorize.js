/**
 * Role-based authorization middleware
 * Checks if authenticated user has required role(s)
 */

/**
 * Generic role-checking middleware factory
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 * @returns {Function} Express middleware function
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Check if user has one of the allowed roles
    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
        message: `This action requires one of the following roles: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
}

/**
 * Middleware to require admin role
 */
export const requireAdmin = requireRole("ADMIN");

/**
 * Middleware to require seller or vendor role
 */
export const requireSeller = requireRole("SELLER", "VENDOR");

/**
 * Middleware to require rider role
 */
export const requireRider = requireRole("RIDER");

/**
 * Middleware to require user role (customer)
 */
export const requireUser = requireRole("USER");

/**
 * Check if user has specific permission
 * @param {Object} user - User object with role
 * @param {string} permission - Permission to check
 * @returns {boolean} True if user has permission
 */
export function hasPermission(user, permission) {
  if (!user || !user.role) {
    return false;
  }

  // Define role permissions
  const rolePermissions = {
    ADMIN: [
      "users:read",
      "users:create",
      "users:update",
      "users:delete",
      "products:read",
      "products:create",
      "products:update",
      "products:delete",
      "orders:read",
      "orders:update",
      "orders:delete",

      "analytics:read",
      "settings:read",
      "settings:update",
    ],

    USER: [
      "products:read",
      "orders:read",
      "cart:read",
      "cart:create",
      "cart:update",
      "cart:delete",
      "wishlist:read",
      "wishlist:create",
      "wishlist:delete",
    ],

    SELLER: [
      "products:read",
      "products:create",
      "orders:read",
      "seller:read",
      "seller:update",
      "stock:read",
      "stock:create",
      "stock:update",
    ],

    VENDOR: [
      "products:read",
      "products:create",
      "orders:read",
      "seller:read",
      "seller:update",
      "stock:read",
      "stock:create",
      "stock:update",
      "negotiations:read",
      "negotiations:create",
      "negotiations:update",
    ],

    RIDER: [
      "orders:read",
      "orders:update",
      "delivery:read",
      "delivery:update",
    ],
  };

  const userPermissions = rolePermissions[user.role] || [];
  return userPermissions.includes(permission);
}

/**
 * Middleware to check specific permission
 * @param {string} permission - Permission to check
 * @returns {Function} Express middleware function
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
        message: `This action requires the '${permission}' permission`,
      });
    }

    next();
  };
}

/**
 * Middleware to check if user can access their own resource or is admin
 * @param {string} userIdParam - Parameter name in req.params containing user ID
 * @returns {Function} Express middleware function
 */
export function requireSelfOrAdmin(userIdParam = "userId") {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const targetUserId = req.params[userIdParam] || req.body.userId;
    const isAdmin = req.user.role === "ADMIN";
    const isSelf = req.user.id === targetUserId;

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
        message: "You can only access your own resources",
      });
    }

    next();
  };
}
