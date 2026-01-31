import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const createTemplate = () => {
    const headers = [
        'Product Name',           // Required
        'Description',
        'Category Name',          // Required - must exist
        'Subcategory Name',       // Optional - but recommended
        'Group Name',             // Optional
        'Brand Name',             // Required - must exist
        'Store Name',             // Required - must exist
        'Vertical',               // Optional (qwik, eato, bazar, star) - default qwik
        'HSN Code',
        'GST Rate',               // e.g. 18
        'Variant SKU',            // Required - Unique
        'Variant Title',          // e.g. "1kg"
        'Variant Price',          // Required
        'Variant Packaging',      // e.g. "Box"
        'Stock Quantity',         // inventory
        'Warehouse ID'            // ID of warehouse for inventory
    ];

    const sampleRow = [
        'Sample Product',
        'This is a sample product description',
        'Snacks & Branded Foods', // Example Category
        'Biscuits & Cookies',     // Example Subcategory
        'Cream Biscuits',         // Example Group
        'Britannia',              // Example Brand
        'Best Mart',             // Example Store
        'qwik',
        '123456',
        18,
        'SKU-001',
        '200g Pack',
        50.00,
        'Plastic URL',
        100,
        1
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([headers, sampleRow]);

    // Set column widths
    ws['!cols'] = headers.map(() => ({ wch: 20 }));

    xlsx.utils.book_append_sheet(wb, ws, 'Products');

    const outputPath = path.join(__dirname, 'product_import_template.xlsx');
    xlsx.writeFile(wb, outputPath);

    console.log(`Template created at: ${outputPath}`);
};

createTemplate();
