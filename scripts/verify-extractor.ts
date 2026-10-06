import { existsSync } from "fs";
import { join } from "path";

function check(path: string, desc: string) {
  if (!existsSync(path)) throw new Error(`missing ${desc}: ${path}`);
  console.log(`✓ ${desc}`);
}

async function main() {
  const root = join(__dirname, "..");
  check(join(root, "prisma/migrations/20261005_extraction_runs/migration.sql"), "extraction runs migration");
  check(join(root, "prisma/schema.prisma"), "schema");
  check(join(root, "lib/extractor/prompt.ts"), "extractor prompt");
  check(join(root, "lib/extractor/gemini.ts"), "extractor gemini");
  check(join(root, "lib/extractor/csv.ts"), "extractor csv");
  check(join(root, "lib/extractor/source.ts"), "extractor source");
  check(join(root, "lib/extractor/run.ts"), "extractor run");
  check(join(root, "app/api/extractor/route.ts"), "api /extractor");
  check(join(root, "app/api/extractor/status/route.ts"), "api /extractor/status");
  check(join(root, "app/api/extractor/runs/[id]/route.ts"), "api /extractor/runs/[id]");
  check(join(root, "app/api/extractor/runs/[id]/csv/route.ts"), "api /extractor/runs/[id]/csv");
  check(join(root, "app/(app)/extractor/page.tsx"), "extractor page");
  check(join(root, "components/extractor-dropzone.tsx"), "extractor dropzone");
  check(join(root, "components/extractor-result.tsx"), "extractor result");
  check(join(root, "lib/csv.ts"), "lib csv");
  check(join(root, "lib/upload-client.ts"), "upload client");
  console.log("All extractor checks passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
