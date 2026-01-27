import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspect() {
    console.log('--- Inspecting add_banner model ---');
    // @ts-ignore - inspecting private details for debugging
    const dmmf = prisma._baseDmmf;
    const model = dmmf.datamodel.models.find(m => m.name === 'add_banner');

    if (model) {
        console.log('Model found:', model.name);
        console.log('Fields:', model.fields.map(f => f.name).join(', '));
    } else {
        console.log('Model add_banner NOT found!');
    }

    await prisma.$disconnect();
}

inspect();
