import prisma from "../config/prisma.js";

class UserDAO {
  // --- User Operations ---
  async createUser(data) {
    return await prisma.users.create({
      data,
    });
  }

  async getUserById(id) {
    return await prisma.users.findUnique({
      where: { id },
      include: {
        addresses: true,
        notifications: {
          orderBy: { created_at: "desc" },
          take: 10,
        },
      },
    });
  }

  async getUserByEmail(email) {
    return await prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        is_active: true,
        created_at: true,
        last_login: true,
        // Explicitly exclude password
      },
    });
  }

  async getUserByEmailWithPassword(email) {
    return await prisma.users.findUnique({
      where: { email },
    });
  }

  async updateUser(id, data) {
    return await prisma.users.update({
      where: { id },
      data,
    });
  }

  async deleteUser(id) {
    return await prisma.users.delete({
      where: { id },
    });
  }

  async listUsers(filters = {}, pagination = {}) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    return await prisma.users.findMany({
      where: filters,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
    });
  }

  // --- Address Operations ---
  async createAddress(data) {
    // If this is set as default, unset others first
    if (data.is_default) {
      await prisma.user_addresses.updateMany({
        where: { user_id: data.user_id },
        data: { is_default: false },
      });
    }

    return await prisma.user_addresses.create({
      data,
    });
  }

  async getAddressById(id) {
    return await prisma.user_addresses.findUnique({
      where: { id },
    });
  }

  async getAddressesByUserId(userId) {
    return await prisma.user_addresses.findMany({
      where: { user_id: userId },
      orderBy: { is_default: "desc" },
    });
  }

  async updateAddress(id, data) {
    if (data.is_default) {
      const address = await this.getAddressById(id);
      if (address) {
        await prisma.user_addresses.updateMany({
          where: { user_id: address.user_id },
          data: { is_default: false },
        });
      }
    }

    return await prisma.user_addresses.update({
      where: { id },
      data,
    });
  }

  async deleteAddress(id) {
    return await prisma.user_addresses.delete({
      where: { id },
    });
  }

  async setDefaultAddress(userId, addressId) {
    await prisma.user_addresses.updateMany({
      where: { user_id: userId },
      data: { is_default: false },
    });

    return await prisma.user_addresses.update({
      where: { id: addressId },
      data: { is_default: true },
    });
  }

  // --- Notification Operations ---
  async createNotification(data) {
    return await prisma.user_notifications.create({
      data,
    });
  }

  async getNotificationsByUserId(userId, filters = {}) {
    return await prisma.user_notifications.findMany({
      where: {
        user_id: userId,
        ...filters,
      },
      orderBy: { created_at: "desc" },
    });
  }

  async markAsRead(notificationId) {
    return await prisma.user_notifications.update({
      where: { id: notificationId },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });
  }

  async markAllAsRead(userId) {
    return await prisma.user_notifications.updateMany({
      where: {
        user_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });
  }

  async deleteNotification(notificationId) {
    return await prisma.user_notifications.delete({
      where: { id: notificationId },
    });
  }

  // --- Authentication Methods ---
  async getUsersByRole(role) {
    return await prisma.users.findMany({
      where: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        is_active: true,
        created_at: true,
        last_login: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  async updatePassword(userId, hashedPassword) {
    return await prisma.users.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }
}

export default new UserDAO();
