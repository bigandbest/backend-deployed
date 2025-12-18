// Quick fix script to update enquiry controller queries
// This removes PostgREST foreign key syntax and fetches related data separately

const fs = require('fs');
const path = require('path');

const controllerPath = path.join(__dirname, 'controller/enquiryController.js');
let content = fs.readFileSync(controllerPath, 'utf8');

// Remove the foreign key syntax from all queries
content = content.replace(/products!product_id \([^)]+\)/g, '');
content = content.replace(/users!user_id \([^)]+\)/g, '');

// Clean up empty lines in select statements
content = content.replace(/select\(\s*`\s*\*,\s*,/g, 'select(`*,');
content = content.replace(/select\(\s*`\s*\*,\s*`/g, 'select(`*`');

fs.writeFileSync(controllerPath, content);
console.log('✅ Fixed enquiry controller queries');
