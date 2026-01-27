import prisma from './config/prisma.js';

async function fix() {
    try {
        console.log("Attempting to fix permissions for service_role...");
        await prisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
        await prisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;`);
        await prisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;`);

        await prisma.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;`);
        await prisma.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;`);
        await prisma.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;`);

        await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO service_role;`);
        await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon;`);
        await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO authenticated;`);

        console.log("✅ Permissions granted successfully to service_role, anon, and authenticated");
    } catch (e) {
        console.error("❌ Error granting permissions:", e);
    } finally {
        await prisma.$disconnect();
    }
}

fix();
