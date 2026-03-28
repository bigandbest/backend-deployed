import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelsDir = path.join(__dirname, '../prisma/models');
const outputFile = path.join(__dirname, '../prisma/schema.prisma');

const header = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// --------------------------------------
// THIS FILE IS AUTO-GENERATED. DO NOT EDIT.
// --------------------------------------
`;

const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.prisma')).sort();

let combined = header;
for (const file of modelFiles) {
  const content = fs.readFileSync(path.join(modelsDir, file), 'utf8');
  combined += `\n// --- Model: ${file} ---\n${content}\n`;
}

fs.writeFileSync(outputFile, combined, 'utf8');
console.log(`✓ Compiled ${modelFiles.length} model files into schema.prisma`);
