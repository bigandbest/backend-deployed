import prisma from '../config/prisma.js';

const seedMappings = async () => {
    try {
        const sections = [
            'dual_deals_left',
            'dual_deals_right',
            'discount_corner_left',
            'discount_corner_right'
        ];

        const subcategories = await prisma.subcategories.findMany({
            take: 4,
            where: { active: true }
        });

        if (subcategories.length === 0) {
            console.log("No active subcategories found.");
            return;
        }

        for (let i = 0; i < sections.length; i++) {
            const key = sections[i];
            const section = await prisma.product_sections.findUnique({
                where: { section_key: key }
            });

            if (!section) {
                console.log(`Section ${key} not found.`);
                continue;
            }

            const existingMapping = await prisma.section_subcategory_mappings.findFirst({
                where: { section_id: section.id }
            });

            if (existingMapping) {
                console.log(`Mapping already exists for ${key}`);
                continue;
            }

            // Map to a subcategory (cycle through if fewer subcategories than sections)
            const sub = subcategories[i % subcategories.length];

            await prisma.section_subcategory_mappings.create({
                data: {
                    section_id: section.id,
                    subcategory_id: sub.id,
                    display_order: 1,
                    is_active: true
                }
            });
            console.log(`Created mapping for ${key} -> ${sub.name}`);
        }
    } catch (error) {
        console.error("Error seeding mappings:", error);
    } finally {
        await prisma.$disconnect();
    }
};

seedMappings();
