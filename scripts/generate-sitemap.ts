import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = "https://birdie-bay-bookings.lovable.app";

// Public discovery pages only: exclude accounts, payments, admin, TV and bay controls.
// Do not invent lastmod dates from build time; add only verified page-specific dates.
const entries = [
  "/", "/about", "/membership-info", "/league-info", "/compete-info",
  "/contact", "/faqs", "/staffed-hours", "/gate-access", "/whats-on",
  "/gift", "/privacy",
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map((path) => `  <url><loc>${BASE_URL}${path}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

writeFileSync(resolve("public/sitemap.xml"), xml);
console.log(`Sitemap generated for ${entries.length} public pages.`);