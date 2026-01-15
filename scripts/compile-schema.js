import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prismaDir = path.join(__dirname, '../prisma');
const modelsDir = path.join(prismaDir, 'models');
const baseFile = path.join(prismaDir, 'base.prisma');
const outputFile = path.join(prismaDir, 'schema.prisma');

async function compileSchema() {
    try {
        console.log('🏗️  Compiling Prisma schema...');

        // Read base file
        let schemaContent = fs.readFileSync(baseFile, 'utf8');
        schemaContent += '\n// --------------------------------------\n';
        schemaContent += '// THIS FILE IS AUTO-GENERATED. DO NOT EDIT.\n';
        schemaContent += '// --------------------------------------\n\n';

        // Read all model files
        if (fs.existsSync(modelsDir)) {
            const files = fs.readdirSync(modelsDir).filter(file => file.endsWith('.prisma'));

            for (const file of files) {
                const filePath = path.join(modelsDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                schemaContent += `// --- Model: ${file} ---\n`;
                schemaContent += content + '\n\n';
            }
        }

        // Write output
        fs.writeFileSync(outputFile, schemaContent);
        console.log('✅ schema.prisma generated successfully!');
    } catch (error) {
        console.error('❌ Error compiling schema:', error);
        process.exit(1);
    }
}

compileSchema();
