import { collection } from "./mongo";
import type { EnvProfile } from "./types";

// Device catalog: known devices and browsers with realistic viewport, pixel ratio and touch settings, so "Samsung Flip Z" becomes a concrete
// environment instead of a guess. Stored in the `environments` collection; matched to the developer's notes with Atlas Search (fuzzy text).

export const DEVICES_SEARCH_INDEX = "environments_search";

export interface DeviceDoc {
  name: string;
  aliases: string[];
  engine: EnvProfile["engine"];
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  notEmulated: string[];
  /** APIs this browser does not have (older iOS and Android versions), applied to the profile as removeApis. */
  removeApis?: string[];
}

const PHONE_GAPS = ["Real device GPU and thermal throttling", "The vendor's browser build and settings", "Real mobile network conditions"];
const DESKTOP_GAPS = ["Real GPU and display driver", "Installed fonts and OS-level scaling quirks", "Browser extensions"];

export const DEVICES: DeviceDoc[] = [
  { name: "Samsung Galaxy Z Flip (unfolded)", aliases: ["samsung flip", "galaxy z flip", "z flip", "flip z", "zflip", "samsung foldable", "samsung flip z android"], engine: "chromium", viewport: { width: 412, height: 1004 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, notEmulated: [...PHONE_GAPS, "The folded cover screen and hinge posture"] },
  { name: "Samsung Galaxy S24", aliases: ["samsung", "galaxy s24", "galaxy", "samsung phone", "android samsung"], engine: "chromium", viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, notEmulated: PHONE_GAPS },
  { name: "Google Pixel 8", aliases: ["pixel", "pixel 8", "google pixel", "android pixel"], engine: "chromium", viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, notEmulated: PHONE_GAPS },
  // iOS before 15.4 lacks crypto.randomUUID, structuredClone, Array.prototype.at/findLast and Object.hasOwn (all added in Safari 15.4).
  { name: "iPhone 8 on iOS 14 (Safari)", aliases: ["iphone 8", "old iphone", "older iphone", "ios 14", "iphone 7", "iphone se", "hasn't updated", "not updated", "old ios"], engine: "webkit", viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, notEmulated: [...PHONE_GAPS, "The exact Safari 14 engine (WebKit is current; missing APIs are removed instead)"], removeApis: ["crypto.randomUUID", "structuredClone", "Array.prototype.at", "Array.prototype.findLast", "Object.hasOwn"] },
  { name: "iPhone 15 (Safari)", aliases: ["iphone", "iphone 15", "ios", "apple phone", "safari ios", "iphone safari"], engine: "webkit", viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, notEmulated: [...PHONE_GAPS, "iOS in-app browser differences (Instagram, Facebook)"] },
  { name: "iPad Pro 11 (Safari)", aliases: ["ipad", "ipad pro", "apple tablet", "tablet safari"], engine: "webkit", viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, notEmulated: PHONE_GAPS },
  { name: "MacBook Pro 14 M4 (Safari)", aliases: ["macbook", "macbook pro", "m4", "mac", "macos safari", "apple laptop", "macbook m4 pro"], engine: "webkit", viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false, notEmulated: DESKTOP_GAPS },
  { name: "MacBook Pro 14 M4 (Chrome)", aliases: ["mac chrome", "macbook chrome", "chrome on mac"], engine: "chromium", viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false, notEmulated: DESKTOP_GAPS },
  { name: "Windows laptop 1080p at 125% scaling (Chrome)", aliases: ["windows laptop", "windows pc", "windows chrome", "pc laptop", "windows 11", "windows 10"], engine: "chromium", viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25, isMobile: false, hasTouch: false, notEmulated: [...DESKTOP_GAPS, "NVIDIA or other GPU specifics"] },
  { name: "Windows desktop 23 inch 1080p monitor (Chrome)", aliases: ["23 inch monitor", "23 monitor", "desktop pc", "windows desktop", "rtx 3060", "nvidia desktop", "gaming pc"], engine: "chromium", viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, notEmulated: [...DESKTOP_GAPS, "NVIDIA RTX GPU rendering and driver version"] },
  { name: "Desktop Firefox 1080p", aliases: ["firefox", "firefox desktop", "mozilla"], engine: "firefox", viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, notEmulated: DESKTOP_GAPS },
];

export const devicesSearchIndex = {
  name: DEVICES_SEARCH_INDEX,
  type: "search",
  definition: { mappings: { dynamic: false, fields: { name: { type: "string" }, aliases: { type: "string" } } } },
} as const;

/** Insert the catalog if it is not there (matched by name), and create the search index. Safe to repeat. */
export async function seedDevices(): Promise<number> {
  const col = await collection<DeviceDoc>("environments");
  let added = 0;
  for (const d of DEVICES) {
    const r = await col.updateOne({ name: d.name }, { $setOnInsert: d }, { upsert: true });
    if (r.upsertedCount) added += 1;
  }
  const existing = (await col.listSearchIndexes().toArray()).map((i) => i.name);
  if (!existing.includes(DEVICES_SEARCH_INDEX)) await col.createSearchIndex({ name: devicesSearchIndex.name, type: devicesSearchIndex.type, definition: devicesSearchIndex.definition });
  return added;
}

/** Catalog devices that match the developer's notes (fuzzy, so typos and word order do not matter). Empty on any failure. */
export async function matchDevices(notes: string, limit = 3): Promise<DeviceDoc[]> {
  if (!notes.trim()) return [];
  try {
    const col = await collection<DeviceDoc>("environments");
    return await col
      .aggregate<DeviceDoc>([
        { $search: { index: DEVICES_SEARCH_INDEX, text: { query: notes, path: ["name", "aliases"], fuzzy: { maxEdits: 1 } } } },
        { $limit: limit },
        { $project: { _id: 0 } },
      ])
      .toArray();
  } catch (e) {
    console.error("matchDevices failed:", (e as Error).message);
    return [];
  }
}
