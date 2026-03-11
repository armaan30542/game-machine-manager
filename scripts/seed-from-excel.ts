import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MACHINE_TYPES = [
  "American Nudge", "Aristocrat 1", "Aristocrat 2", "Aristocrat Monaco",
  "Aurora 1", "Aurora 3", "Aurora Link 3", "Aurora Superlink", "Aurora Superlink 1",
  "Bad Dog Hollywood", "Best Classic", "Best Of Nudge", "Cash City", "Crossbow 2",
  "Diamond Skill 1", "Diamond Skill 2", "Diamond Skill 3", "Diamond Skill 4",
  "Diamond Skill 5", "Diamond Skill 6", "Diamond Skill 7", "Diamond Skill 8",
  "Diamond Skill 9", "Fantasy Lane", "Fort Knox 1", "Fort Knox 2",
  "Fusion 1", "Fusion 2", "Fusion 3", "Fusion 4", "Fusion 5", "Fusion 6",
  "Fusion Lightning 1", "Fusion Lightning 2", "Fusion Lightning 3",
  "Fusion Lightning 4", "Fusion Lightning 6",
  "Fusion Link1", "Fusion Link2", "Fusion Link3", "Fusion Link4",
  "Gone Wild 2", "Hollywood", "JVL 1", "JVL 2",
  "Light & Wonder 1", "Light & Wonder 2", "Multi Nudge", "Nudge 4 Fun",
  "Phoenix Optimum 4", "Pick n Play Black", "Pick n Play Blue",
  "Pick n Play Red", "Pick n Play Purple", "Players Edge Cash Eruption",
  "Platinum 1", "Platinum 2", "Platinum 3", "Platinum 4",
  "Primero Generic", "QuantumLink 601", "SkyRiser 1", "Super Duo",
  "SuperSkill 1", "Sweet Road to Freedom", "The Price is Right",
  "Tip Top", "Twin Spin", "Zydexo Generic",
];

async function main() {
  const filePath = process.argv[2] || "../Locations_V3.xlsx";
  console.log(`Reading: ${filePath}`);

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows`);

  // Seed machine types
  console.log("\n--- Seeding machine types ---");
  for (const typeName of MACHINE_TYPES) {
    const { error } = await supabase
      .from("machine_types")
      .upsert({ name: typeName, is_active: true }, { onConflict: "name" });
    if (error) console.error(`Error seeding type ${typeName}:`, error.message);
  }
  console.log(`Seeded ${MACHINE_TYPES.length} machine types`);

  // Map Excel column headers to our fields
  // The Excel has these headers (from the analysis):
  // A: "Number" (location number like VA001)
  // B: "Name" (location name)
  // C: "Address Line 1"
  // D: "Address Line 2"
  // E: "City"
  // F: "County"
  // G: "State"
  // H: "Zipcode"
  // I: "Phone"
  // J: "Email"
  // K: "Contact Name"
  // L: "Contact Phone"
  // M: "Contract" (Y/N)
  // N: "Percentage" (0.2 = 20%)
  // O: "Fees"
  // P-X: Machine 01 through 09
  // Y-AG: Cabinet Type 01 through 09
  // AH: "Dispenser" (Y/N)
  // AI: "Dispenser Cash"
  // AJ: "URL Link"
  // AK-AS: Serial Number 01 through 09
  // AT: (empty)
  // AU: "Comments"
  // AV: "Location Close Date"

  console.log("\n--- Seeding locations and machines ---");
  let totalMachines = 0;
  let totalDispensers = 0;

  for (const row of rows) {
    const locationNumber = String(row["Location Number"] || "").trim();
    if (!locationNumber) continue;

    const name = String(row["Location Name"] || "").trim();
    if (!name) continue;

    // Parse percentage - could be decimal (0.5) or integer (50)
    let percentageShare = Number(row["Percentage Share"] ?? 50);
    if (percentageShare <= 1) percentageShare = percentageShare * 100;

    const locationData = {
      location_number: locationNumber,
      name,
      address_line1: String(row["Location Address Line 1"] || "").trim(),
      address_line2: row["Location Address Line 2"]
        ? String(row["Location Address Line 2"]).trim()
        : null,
      city: String(row["Location City"] || "").trim(),
      county: row["Location County"] ? String(row["Location County"]).trim() : null,
      state: String(row["Location State"] || "VA").trim(),
      zipcode: String(row["Location Zipcode"] || "").trim(),
      phone: row["Location Phone Number"] ? String(row["Location Phone Number"]).trim() : null,
      email: row["Location Email"] ? String(row["Location Email"]).trim() : null,
      contact_name: row["Location Contact Name"]
        ? String(row["Location Contact Name"]).trim()
        : null,
      contact_phone: row["Location Contact Phone Number"]
        ? String(row["Location Contact Phone Number"]).trim()
        : null,
      has_contract: String(row["Contract (Y/N)"] || "").toUpperCase() === "Y",
      percentage_share: percentageShare,
      fees: Number(row["Fees"] ?? 0),
      revenue_url: row["url Link"]
        ? String(row["url Link"]).trim()
        : null,
      comments: (() => {
        const c = row["Comments"] ? String(row["Comments"]).trim() : "";
        const cd = row["Location Close Date"] ? String(row["Location Close Date"]).trim() : "";
        // If close_date is not a valid date, treat it as a comment
        const isDate = cd && !isNaN(Date.parse(cd));
        const extra = (!isDate && cd) ? cd : "";
        return [c, extra].filter(Boolean).join(" | ") || null;
      })(),
      close_date: (() => {
        const cd = row["Location Close Date"] ? String(row["Location Close Date"]).trim() : null;
        if (!cd) return null;
        const parsed = Date.parse(cd);
        return isNaN(parsed) ? null : new Date(parsed).toISOString().split("T")[0];
      })(),
    };

    const { data: location, error: locError } = await supabase
      .from("locations")
      .upsert(locationData, { onConflict: "location_number" })
      .select("id")
      .single();

    if (locError) {
      console.error(`Error: ${locationNumber} - ${locError.message}`);
      continue;
    }

    // Insert machines (up to 9)
    let machineCount = 0;
    for (let i = 1; i <= 9; i++) {
      const padded = String(i).padStart(2, "0");
      const machineType = row[`Machine ${padded}`];
      const cabinetType = row[`Cabinet Type ${padded}`];
      const serialCol1 = row[`Serial Numner ${padded}`]; // typo in Excel is the actual header
      const serialCol2 = row[`Serial Number ${padded}`]; // fallback if they fix it

      const serial = serialCol1 || serialCol2;

      if (!machineType) continue;

      const machineData = {
        machine_type: String(machineType).trim(),
        cabinet_type: cabinetType
          ? String(cabinetType).trim()
          : "Single Metal",
        serial_number: serial
          ? String(serial).trim()
          : `${locationNumber}-M${padded}`,
        location_id: location.id,
        position_at_location: i,
      };

      const { error: machError } = await supabase
        .from("machines")
        .upsert(machineData, { onConflict: "serial_number" });

      if (machError) {
        console.error(
          `  Machine error at ${locationNumber} pos ${i}: ${machError.message}`
        );
      } else {
        machineCount++;
      }
    }

    // Insert dispenser if present
    const hasDispenser =
      String(row["Dispenser (Y/N)"] || "").toUpperCase() === "Y";
    if (hasDispenser) {
      const { error: dispError } = await supabase
        .from("dispensers")
        .insert({
          location_id: location.id,
          dispenser_cash: Number(row["Dispenser Cash"] ?? 0),
          serial_number: `DISP-${locationNumber}`,
        });

      if (dispError) {
        // Might already exist (unique constraint on location_id)
        if (!dispError.message.includes("duplicate")) {
          console.error(
            `  Dispenser error at ${locationNumber}: ${dispError.message}`
          );
        }
      } else {
        totalDispensers++;
      }
    }

    totalMachines += machineCount;
    console.log(
      `  ${locationNumber} - ${name}: ${machineCount} machines${
        hasDispenser ? " + dispenser" : ""
      }`
    );
  }

  console.log(
    `\n=== DONE ===\nLocations: ${rows.length}\nMachines: ${totalMachines}\nDispensers: ${totalDispensers}`
  );
}

main().catch(console.error);
