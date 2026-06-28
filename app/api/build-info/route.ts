import fs from "node:fs";
import path from "node:path";

export async function GET() {
  const appRoot = process.env.TSL_APP_ROOT || process.cwd();
  const markerPath = path.join(appRoot, ".deploy-marker");
  const marker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, "utf8").trim() : "local-dev";
  return Response.json(
    {
      app: "Baxter Growth Lab",
      marker,
      descriptionFormatter: "publishing-pack-description-blocks-v3",
      apiProxy: "cloudways-index-php-v1"
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
