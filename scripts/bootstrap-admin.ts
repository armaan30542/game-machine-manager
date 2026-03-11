import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/bootstrap-admin.ts <email>");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("email", email)
    .select()
    .single();

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  console.log(`User ${data.email} is now admin (role: ${data.role})`);
}

main().catch(console.error);
