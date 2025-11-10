// Script to create a sample Excel file
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

function createSampleExcel() {
  console.log("📊 Creating sample Excel file...");

  const sampleData = [
    ["zone_name", "pincode", "city", "state"],
    ["DelhiZone", "110001", "New Delhi", "Delhi"],
    ["DelhiZone", "110002", "Delhi Cantt", "Delhi"],
    ["DelhiZone", "110003", "New Delhi GPO", "Delhi"],
    ["DelhiZone", "122001", "Gurgaon", "Haryana"],
    ["DelhiZone", "122002", "Sector 14 Gurgaon", "Haryana"],
    ["MumbaiZone", "400001", "Fort Mumbai", "Maharashtra"],
    ["MumbaiZone", "400002", "Kalbadevi", "Maharashtra"],
    ["MumbaiZone", "400003", "Mumbai GPO", "Maharashtra"],
    ["MumbaiZone", "400004", "Girgaon", "Maharashtra"],
    ["ChennaiZone", "600001", "Chennai GPO", "Tamil Nadu"],
    ["ChennaiZone", "600002", "Anna Salai", "Tamil Nadu"],
    ["ChennaiZone", "600003", "Egmore", "Tamil Nadu"],
    ["BangaloreZone", "560001", "Bangalore GPO", "Karnataka"],
    ["BangaloreZone", "560002", "Bangalore East", "Karnataka"],
    ["BangaloreZone", "560003", "Malleswaram", "Karnataka"],
    ["PuneZone", "411001", "Pune Camp", "Maharashtra"],
    ["PuneZone", "411002", "Pune Cantt", "Maharashtra"],
    ["HyderabadZone", "500001", "Hyderabad GPO", "Telangana"],
    ["HyderabadZone", "500003", "Secunderabad", "Telangana"],
  ];

  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Create worksheet from data
  const worksheet = XLSX.utils.aoa_to_sheet(sampleData);

  // Set column widths for better readability
  worksheet["!cols"] = [
    { width: 15 }, // zone_name
    { width: 10 }, // pincode
    { width: 20 }, // city
    { width: 15 }, // state
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, "Zone Pincodes");

  // Write to admin folder
  const adminPath = path.resolve("../admin");
  const excelPath = path.join(adminPath, "zone_pincodes_sample.xlsx");

  // Write the Excel file
  XLSX.writeFile(workbook, excelPath);

  console.log(`✅ Sample Excel file created at: ${excelPath}`);
  console.log(
    `📋 Contains ${sampleData.length - 1} data rows with ${
      Object.keys(
        sampleData
          .slice(1)
          .reduce((acc, row) => ({ ...acc, [row[0]]: true }), {})
      ).length
    } zones`
  );

  // Also create buffer for verification
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  console.log(`📦 Excel buffer size: ${buffer.length} bytes`);

  return excelPath;
}

// Run the script
try {
  const filePath = createSampleExcel();
  console.log("\n🎉 Sample Excel file created successfully!");
  console.log("📁 Location:", filePath);
} catch (error) {
  console.error("💥 Error creating sample Excel:", error.message);
}
