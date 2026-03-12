import UserDAO from "../dao/user.dao.js";
import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";

export const getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const role = req.query.role || "";
        const status = req.query.status || "";

        const where = {
            AND: [
                {
                    OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { email: { contains: search, mode: "insensitive" } },
                        { phone: { contains: search, mode: "insensitive" } },
                    ],
                },
            ],
        };

        if (role) {
            where.AND.push({ role: role });
        }

        if (status === "active") {
            where.AND.push({ is_active: true });
        } else if (status === "inactive") {
            where.AND.push({ is_active: false });
        }

        const [users, total] = await Promise.all([
            prisma.users.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: "desc" },
                include: {
                    user_addresses: {
                        where: { is_default: true },
                        take: 1,
                    },
                },
            }),
            prisma.users.count({ where }),
        ]);

        // Format users to match frontend expectations
        const formattedUsers = users.map((user) => {
            const defaultAddress = user.user_addresses?.[0];
            let fullAddress = "";
            if (defaultAddress) {
                fullAddress = [
                    defaultAddress.house_number,
                    defaultAddress.street_address,
                    defaultAddress.locality,
                    defaultAddress.city,
                    defaultAddress.state,
                    defaultAddress.postal_code,
                ]
                    .filter(Boolean)
                    .join(", ");
            }

            return {
                ...user, // include other fields first
                id: user.id,
                name: user.name || "N/A",
                email: user.email,
                phone: user.phone || "",
                role: user.role.toLowerCase(),
                active: user.is_active,
                joined: user.created_at,
                avatar: user.avatar || user.photo_url,
                account_type: user.account_type,
                company_name: user.company_name,
                fullAddress: fullAddress,
            };
        });

        res.status(200).json({
            success: true,
            users: formattedUsers,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Error in getUsers:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createUser = async (req, res) => {
    try {
        const { name, email, password, phone, role, active, ...addressData } =
            req.body;

        // Check if user exists
        const existingUser = await UserDAO.getUserByEmail(email);
        if (existingUser) {
            return res
                .status(400)
                .json({ success: false, error: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.users.create({
            data: {
                name,
                email,
                password: hashedPassword,
                phone,
                role: role.toUpperCase(),
                is_active: active !== undefined ? active : true,
                account_type: req.body.account_type,
                company_name: req.body.company_name,
            },
        });

        // Create address if provided
        if (addressData.street_address || addressData.city) {
            await prisma.user_addresses.create({
                data: {
                    user_id: newUser.id,
                    address_name: "Default",
                    is_default: true,
                    street_address: addressData.street_address || "",
                    house_number: addressData.house_number || "",
                    suite_unit_floor: addressData.suite_unit_floor || "",
                    locality: addressData.locality || "",
                    city: addressData.city || "",
                    state: addressData.state || "",
                    postal_code: addressData.postal_code || "",
                    country: addressData.country || "India",
                    landmark: addressData.landmark || "",
                },
            });
        }

        res.status(201).json({ success: true, user: newUser });
    } catch (error) {
        console.error("Error in createUser:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, phone, role, active, account_type, company_name } = req.body;

        const updatedUser = await prisma.users.update({
            where: { id: userId },
            data: {
                name,
                phone,
                role: role ? role.toUpperCase() : undefined,
                is_active: active,
                account_type,
                company_name,
            },
        });

        res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("Error in updateUser:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        await prisma.users.delete({
            where: { id: userId },
        });

        res.status(200).json({ success: true, message: "User deleted successfully" });
    } catch (error) {
        console.error("Error in deleteUser:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const toggleUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { active } = req.body;

        const updatedUser = await prisma.users.update({
            where: { id: userId },
            data: { is_active: active },
        });

        res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("Error in toggleUserStatus:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
