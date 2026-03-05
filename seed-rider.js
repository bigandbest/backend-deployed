import prisma from './config/prisma.js';
import bcrypt from 'bcrypt';
import { generateToken } from './utils/jwtUtils.js';

async function seedRider() {
    try {
        await prisma.$connect();
        console.log('Connected to database');

        // 1. Find a division warehouse (has parent_warehouse_id)
        const divisionWarehouse = await prisma.warehouses.findFirst({
            where: { parent_warehouse_id: { not: null }, is_active: true },
            include: { parent_warehouse: true, warehouse_pincodes: true },
        });

        if (!divisionWarehouse) {
            console.log('No division warehouse found. Listing all warehouses:');
            const all = await prisma.warehouses.findMany({ select: { id: true, name: true, type: true, parent_warehouse_id: true } });
            console.table(all);
            process.exit(1);
        }

        console.log(`Found division warehouse: ${divisionWarehouse.name} (ID: ${divisionWarehouse.id})`);
        console.log(`Parent: ${divisionWarehouse.parent_warehouse?.name || 'N/A'}`);
        console.log(`Pincodes: ${divisionWarehouse.warehouse_pincodes.map(p => p.pincode).join(', ')}`);

        // 2. Create user with RIDER role
        const email = 'rider.demo@bigbestmart.com';
        const password = 'Rider@123';
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if already exists
        const existing = await prisma.users.findUnique({ where: { email } });
        if (existing) {
            console.log(`\nRider already exists with email: ${email}`);
            console.log('Login credentials:');
            console.log(`  Email: ${email}`);
            console.log(`  Password: ${password}`);

            const rider = await prisma.riders.findUnique({ where: { user_id: existing.id } });
            if (rider) {
                console.log(`  Rider ID: ${rider.id}`);
                console.log(`  Verification: ${rider.verification_status}`);
            }
            process.exit(0);
        }

        const result = await prisma.$transaction(async (tx) => {
            // Create user
            const user = await tx.users.create({
                data: {
                    email,
                    password: hashedPassword,
                    name: 'Demo Rider',
                    phone: '9876543210',
                    role: 'RIDER',
                    is_active: true,
                }
            });
            console.log(`Created user: ${user.id}`);

            // Create rider profile (VERIFIED)
            const rider = await tx.riders.create({
                data: {
                    user_id: user.id,
                    vehicle_type: 'bike',
                    vehicle_number: 'UP-32-AB-1234',
                    license_number: 'DL-1234567890',
                    emergency_contact: '9988776655',
                    verification_status: 'VERIFIED',
                    is_verified: true,
                    is_active: true,
                    is_available: true,
                    approved_at: new Date(),
                }
            });
            console.log(`Created rider: ${rider.id} (VERIFIED)`);

            // Create all 4 documents as APPROVED
            const docTypes = ['DRIVERS_LICENSE', 'ID_PROOF', 'VEHICLE_REGISTRATION', 'PHOTO'];
            for (const docType of docTypes) {
                await tx.rider_documents.create({
                    data: {
                        rider_id: rider.id,
                        document_type: docType,
                        document_url: `https://placehold.co/400x300?text=${docType}`,
                        status: 'APPROVED',
                        reviewed_at: new Date(),
                    }
                });
            }
            console.log('Created 4 approved documents');

            // Assign to division warehouse
            await tx.warehouse_riders.create({
                data: {
                    warehouse_id: divisionWarehouse.id,
                    rider_id: rider.id,
                    is_active: true,
                }
            });
            console.log(`Assigned to warehouse: ${divisionWarehouse.name} (ID: ${divisionWarehouse.id})`);

            return { user, rider };
        });

        // Generate token for testing
        const token = generateToken({
            id: result.user.id,
            email: result.user.email,
            role: 'RIDER',
            name: result.user.name,
            rider_id: result.rider.id,
        });

        console.log('\n========================================');
        console.log('✅ DUMMY RIDER CREATED SUCCESSFULLY');
        console.log('========================================');
        console.log(`Email:    ${email}`);
        console.log(`Password: ${password}`);
        console.log(`Rider ID: ${result.rider.id}`);
        console.log(`Warehouse: ${divisionWarehouse.name}`);
        console.log(`Pincodes: ${divisionWarehouse.warehouse_pincodes.map(p => p.pincode).join(', ')}`);
        console.log(`Token:    ${token}`);
        console.log('========================================\n');

    } catch (error) {
        console.error('Seed error:', error);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

seedRider();
