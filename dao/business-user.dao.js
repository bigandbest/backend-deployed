import prisma from '../config/prisma.js';

class BusinessUserDAO {
    async createUser(data) {
        return await prisma.business_users.create({
            data
        });
    }

    async getUserByEmail(email) {
        return await prisma.business_users.findUnique({
            where: { email }
        });
    }

    async getAllUsers() {
        return await prisma.business_users.findMany();
    }

    // Helper to maintain compatibility if updateUserAvatar expects UserDAO-like behavior
    // but authController uses UserDAO for avatar updates on *standard* users?
    // authController.js has `signup` (business) and `updateUserAvatar` (UserDAO). 
    // It seems `updateUserAvatar` handles "users" table, while `signup` handles "business_users".
    // They might be separate. Confirming usage in authController:
    // `signup` -> `supabase.from("business_users")`
    // `login` -> `supabase.from("business_users")`
    // `getAllBusinessUsers` -> `supabase.from("business_users")`
    // `updateUserAvatar` -> `UserDAO.updateUser(userId, ...)`
    // So standard users vs business users are distinct tables?
    // Yes, likely.
}

export default new BusinessUserDAO();
