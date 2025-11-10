const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupSampleData() {
  try {
    console.log("Setting up sample zones and pincodes...");

    // Insert sample delivery zones
    const { data: zones, error: zonesError } = await supabase
      .from("delivery_zones")
      .upsert(
        [
          {
            name: "delhi_ncr",
            display_name: "Delhi NCR",
            is_nationwide: false,
            is_active: true,
            description: "Delhi National Capital Region",
          },
          {
            name: "mumbai",
            display_name: "Mumbai Metro",
            is_nationwide: false,
            is_active: true,
            description: "Mumbai Metropolitan Area",
          },
          {
            name: "bangalore",
            display_name: "Bangalore Urban",
            is_nationwide: false,
            is_active: true,
            description: "Bangalore Urban District",
          },
        ],
        { onConflict: "name" }
      )
      .select();

    if (zonesError) {
      console.error("Error creating zones:", zonesError);
      return;
    }

    console.log("✅ Zones created:", zones.length);

    // Insert sample zone pincodes
    const pincodes = [];
    zones.forEach((zone) => {
      if (zone.name === "delhi_ncr") {
        pincodes.push(
          {
            zone_id: zone.id,
            pincode: "110001",
            city: "New Delhi",
            state: "Delhi",
          },
          {
            zone_id: zone.id,
            pincode: "110002",
            city: "Delhi",
            state: "Delhi",
          },
          { zone_id: zone.id, pincode: "110003", city: "Delhi", state: "Delhi" }
        );
      } else if (zone.name === "mumbai") {
        pincodes.push(
          {
            zone_id: zone.id,
            pincode: "400001",
            city: "Mumbai",
            state: "Maharashtra",
          },
          {
            zone_id: zone.id,
            pincode: "400002",
            city: "Mumbai",
            state: "Maharashtra",
          },
          {
            zone_id: zone.id,
            pincode: "400003",
            city: "Mumbai",
            state: "Maharashtra",
          }
        );
      } else if (zone.name === "bangalore") {
        pincodes.push(
          {
            zone_id: zone.id,
            pincode: "560001",
            city: "Bangalore",
            state: "Karnataka",
          },
          {
            zone_id: zone.id,
            pincode: "560002",
            city: "Bangalore",
            state: "Karnataka",
          },
          {
            zone_id: zone.id,
            pincode: "560003",
            city: "Bangalore",
            state: "Karnataka",
          }
        );
      }
    });

    const { data: insertedPincodes, error: pincodesError } = await supabase
      .from("zone_pincodes")
      .upsert(pincodes, { onConflict: "zone_id,pincode" })
      .select();

    if (pincodesError) {
      console.error("Error creating pincodes:", pincodesError);
      return;
    }

    console.log("✅ Pincodes created:", insertedPincodes.length);

    // Create a sample zonal warehouse if none exists
    const { data: existingWarehouse, error: checkError } = await supabase
      .from("warehouses")
      .select("*")
      .eq("type", "zonal")
      .limit(1);

    let zonalWarehouse;
    if (checkError) {
      console.error("Error checking warehouses:", checkError);
      return;
    }

    if (!existingWarehouse || existingWarehouse.length === 0) {
      const { data: newWarehouse, error: createWarehouseError } = await supabase
        .from("warehouses")
        .insert([
          {
            name: "Delhi Zonal Hub",
            type: "zonal",
            address: "Delhi NCR",
            is_active: true,
            hierarchy_level: 1,
          },
        ])
        .select()
        .single();

      if (createWarehouseError) {
        console.error("Error creating zonal warehouse:", createWarehouseError);
        return;
      }

      zonalWarehouse = newWarehouse;
      console.log("✅ Zonal warehouse created:", zonalWarehouse.name);
    } else {
      zonalWarehouse = existingWarehouse[0];
      console.log("✅ Zonal warehouse exists:", zonalWarehouse.name);
    }

    // Assign zones to the zonal warehouse
    const delhiZone = zones.find((z) => z.name === "delhi_ncr");
    if (delhiZone) {
      const { data: warehouseZone, error: wzError } = await supabase
        .from("warehouse_zones")
        .upsert(
          [
            {
              warehouse_id: zonalWarehouse.id,
              zone_id: delhiZone.id,
              is_active: true,
            },
          ],
          { onConflict: "warehouse_id,zone_id" }
        )
        .select();

      if (wzError) {
        console.error("Error assigning zone to warehouse:", wzError);
        return;
      }

      console.log("✅ Zone assigned to warehouse");
    }

    console.log("🎉 Sample data setup complete!");
    console.log(
      "You can now create division warehouses under the zonal warehouse."
    );
  } catch (error) {
    console.error("Setup error:", error);
  }
}

setupSampleData();
