/**
 * Niakofa Seed — Fort Worth / Tarrant County Civic Organizations
 *
 * Seeds 19 civic resources for Tarrant County, TX.
 * Safe to re-run: deduplicates by org_name + state + county.
 *
 * Community Map Backend Geo: the 19 TARRANT_ORGS entries carry real
 * approximate downtown/central Fort Worth coordinates + address + a
 * representative weekly open_hours schedule, so they're plottable via
 * GET /civic/resources/nearby. TARRANT_FARMS entries are left without
 * coordinates (out of scope for this pass) — they keep working through the
 * existing region-based /civic/resources lookup, just not on the map yet.
 *
 * Run: pnpm --filter @workspace/scripts run seed
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { civicResourcesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

const TARRANT_ORGS = [
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Tarrant Area Food Bank",
    description: "Provides food assistance to 13 counties in North Texas, distributing millions of meals each year through a network of partner agencies.",
    url: "https://tafb.org",
    phone: "(817) 857-7100",
    category: "food",
    address: "2600 Cullen St, Fort Worth, TX 76107",
    latitude: 32.758,
    longitude: -97.363,
    open_hours: "{\"mon\": \"08:00-17:00\", \"tue\": \"08:00-17:00\", \"wed\": \"08:00-17:00\", \"thu\": \"08:00-17:00\", \"fri\": \"08:00-17:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Salvation Army — Fort Worth",
    description: "Emergency services including food, shelter, disaster relief, and social services for families in crisis throughout Tarrant County.",
    url: "https://salvationarmytexas.org/fortworth",
    phone: "(817) 923-7131",
    category: "emergency",
    address: "1855 E Lancaster Ave, Fort Worth, TX 76103",
    latitude: 32.744,
    longitude: -97.308,
    open_hours: "{\"mon\": \"08:00-18:00\", \"tue\": \"08:00-18:00\", \"wed\": \"08:00-18:00\", \"thu\": \"08:00-18:00\", \"fri\": \"08:00-18:00\", \"sat\": \"09:00-13:00\", \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Catholic Charities Fort Worth",
    description: "Holistic social services including refugee resettlement, immigration legal services, emergency assistance, and counseling.",
    url: "https://catholiccharitiesfortworth.org",
    phone: "(817) 534-0814",
    category: "social_services",
    address: "249 W Thornhill Dr, Fort Worth, TX 76115",
    latitude: 32.699,
    longitude: -97.328,
    open_hours: "{\"mon\": \"08:30-17:00\", \"tue\": \"08:30-17:00\", \"wed\": \"08:30-17:00\", \"thu\": \"08:30-17:00\", \"fri\": \"08:30-17:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Presbyterian Night Shelter",
    description: "One of the largest homeless shelters in North Texas, providing emergency shelter, meals, case management, and housing navigation.",
    url: "https://www.pvnightshelf.org",
    phone: "(817) 632-5400",
    category: "housing",
    address: "2400 Cypress St, Fort Worth, TX 76102",
    latitude: 32.746,
    longitude: -97.34,
    open_hours: "{\"mon\": \"00:00-23:59\", \"tue\": \"00:00-23:59\", \"wed\": \"00:00-23:59\", \"thu\": \"00:00-23:59\", \"fri\": \"00:00-23:59\", \"sat\": \"00:00-23:59\", \"sun\": \"00:00-23:59\"}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Union Gospel Mission of Tarrant County",
    description: "Faith-based rescue mission providing meals, shelter, addiction recovery programs, and job training to homeless individuals.",
    url: "https://www.ugmtc.org",
    phone: "(817) 338-9331",
    category: "housing",
    address: "1301 E Belknap St, Fort Worth, TX 76102",
    latitude: 32.762,
    longitude: -97.323,
    open_hours: "{\"mon\": \"07:00-19:00\", \"tue\": \"07:00-19:00\", \"wed\": \"07:00-19:00\", \"thu\": \"07:00-19:00\", \"fri\": \"07:00-19:00\", \"sat\": \"08:00-16:00\", \"sun\": \"08:00-16:00\"}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "SafeHaven of Tarrant County",
    description: "Comprehensive domestic violence services including emergency shelter, crisis hotline, legal advocacy, and children's programs.",
    url: "https://www.safehaventc.org",
    phone: "(877) 701-7233",
    category: "safety",
    address: "PO Box 137, Fort Worth, TX 76101 (24/7 crisis hotline)",
    latitude: 32.7555,
    longitude: -97.3308,
    open_hours: "{\"mon\": \"00:00-23:59\", \"tue\": \"00:00-23:59\", \"wed\": \"00:00-23:59\", \"thu\": \"00:00-23:59\", \"fri\": \"00:00-23:59\", \"sat\": \"00:00-23:59\", \"sun\": \"00:00-23:59\"}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Meals on Wheels of Tarrant County",
    description: "Delivers nutritious meals and friendly visits to homebound seniors and adults with disabilities across Tarrant County.",
    url: "https://www.mealsonwheels.org/tarrantcounty",
    phone: "(817) 336-0912",
    category: "seniors",
    address: "5740 Airport Fwy, Fort Worth, TX 76117",
    latitude: 32.796,
    longitude: -97.289,
    open_hours: "{\"mon\": \"08:00-16:30\", \"tue\": \"08:00-16:30\", \"wed\": \"08:00-16:30\", \"thu\": \"08:00-16:30\", \"fri\": \"08:00-16:30\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Boys & Girls Clubs of Greater Tarrant County",
    description: "After-school and summer programs for youth focusing on academic success, healthy lifestyles, and good character.",
    url: "https://www.bgcgtc.org",
    phone: "(817) 886-8080",
    category: "youth",
    address: "1424 Oakhurst Scenic Dr, Fort Worth, TX 76111",
    latitude: 32.778,
    longitude: -97.316,
    open_hours: "{\"mon\": \"07:00-18:00\", \"tue\": \"07:00-18:00\", \"wed\": \"07:00-18:00\", \"thu\": \"07:00-18:00\", \"fri\": \"07:00-18:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Volunteer Center of North Texas",
    description: "Connects individuals and groups with volunteer opportunities at nonprofits across the Dallas-Fort Worth metroplex.",
    url: "https://www.volunteernorthtexas.org",
    phone: "(214) 826-6767",
    category: "volunteering",
    address: "1300 Circle Dr, Fort Worth, TX 76119",
    latitude: 32.7555,
    longitude: -97.3308,
    open_hours: "{\"mon\": \"09:00-17:00\", \"tue\": \"09:00-17:00\", \"wed\": \"09:00-17:00\", \"thu\": \"09:00-17:00\", \"fri\": \"09:00-17:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Carter BloodCare — Fort Worth",
    description: "Regional nonprofit blood center supplying lifesaving blood products to more than 200 hospitals across North and Central Texas.",
    url: "https://www.carterbloodcare.org",
    phone: "(800) 366-2834",
    category: "health",
    address: "2205 Hemphill St, Fort Worth, TX 76110",
    latitude: 32.728,
    longitude: -97.332,
    open_hours: "{\"mon\": \"07:00-19:00\", \"tue\": \"07:00-19:00\", \"wed\": \"07:00-19:00\", \"thu\": \"07:00-19:00\", \"fri\": \"07:00-19:00\", \"sat\": \"08:00-14:00\", \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Our Daily Bread",
    description: "Provides hot meals, clothing, hygiene products, and social services to homeless and low-income individuals in downtown Fort Worth.",
    url: "https://www.ourdailybreadfw.org",
    phone: "(817) 332-1177",
    category: "food",
    address: "1712 5th Ave, Fort Worth, TX 76110",
    latitude: 32.73,
    longitude: -97.335,
    open_hours: "{\"mon\": \"09:00-13:00\", \"tue\": \"09:00-13:00\", \"wed\": \"09:00-13:00\", \"thu\": \"09:00-13:00\", \"fri\": \"09:00-13:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "ACH Child and Family Services",
    description: "Nonprofit child welfare organization offering foster care, adoption, residential treatment, and family preservation services.",
    url: "https://www.achservices.org",
    phone: "(817) 335-4673",
    category: "youth",
    address: "3901 Adair St, Fort Worth, TX 76107",
    latitude: 32.746,
    longitude: -97.382,
    open_hours: "{\"mon\": \"08:00-17:00\", \"tue\": \"08:00-17:00\", \"wed\": \"08:00-17:00\", \"thu\": \"08:00-17:00\", \"fri\": \"08:00-17:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Tarrant County Homeless Coalition",
    description: "Coordinates the Continuum of Care for homeless services in Tarrant County, managing the HUD point-in-time count and resource directory.",
    url: "https://www.tarrantcountyhomeless.org",
    phone: "(817) 509-3695",
    category: "housing",
    address: "411 W Belknap St, Fort Worth, TX 76102",
    latitude: 32.759,
    longitude: -97.332,
    open_hours: "{\"mon\": \"08:30-17:00\", \"tue\": \"08:30-17:00\", \"wed\": \"08:30-17:00\", \"thu\": \"08:30-17:00\", \"fri\": \"08:30-17:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "JPS Health Network — Community Health",
    description: "Tarrant County's public hospital district offering primary care, behavioral health, and community health programs regardless of ability to pay.",
    url: "https://www.jpshealthnet.org",
    phone: "(817) 921-3431",
    category: "health",
    address: "1500 S Main St, Fort Worth, TX 76104",
    latitude: 32.735,
    longitude: -97.326,
    open_hours: "{\"mon\": \"00:00-23:59\", \"tue\": \"00:00-23:59\", \"wed\": \"00:00-23:59\", \"thu\": \"00:00-23:59\", \"fri\": \"00:00-23:59\", \"sat\": \"00:00-23:59\", \"sun\": \"00:00-23:59\"}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Lena Pope",
    description: "Mental health and education services for children and families, including school-based counseling and early childhood programs.",
    url: "https://www.lenapope.org",
    phone: "(817) 255-2500",
    category: "mental_health",
    address: "3131 Sanguinet St, Fort Worth, TX 76107",
    latitude: 32.742,
    longitude: -97.36,
    open_hours: "{\"mon\": \"08:00-17:00\", \"tue\": \"08:00-17:00\", \"wed\": \"08:00-17:00\", \"thu\": \"08:00-17:00\", \"fri\": \"08:00-17:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "All Saints Health Foundation",
    description: "Supports community health initiatives and funds programs addressing health disparities in underserved Tarrant County populations.",
    url: "https://www.allsaintsfoundation.org",
    phone: "(817) 922-4700",
    category: "health",
    address: "1900 Pennsylvania Ave, Fort Worth, TX 76104",
    latitude: 32.728,
    longitude: -97.322,
    open_hours: "{\"mon\": \"09:00-17:00\", \"tue\": \"09:00-17:00\", \"wed\": \"09:00-17:00\", \"thu\": \"09:00-17:00\", \"fri\": \"09:00-17:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Cornerstone Assistance Network",
    description: "Provides emergency assistance, job training, financial coaching, and transitional housing to individuals and families in crisis.",
    url: "https://www.cornerstonean.org",
    phone: "(817) 632-6000",
    category: "emergency",
    address: "2600 Vickery Blvd W, Fort Worth, TX 76107",
    latitude: 32.746,
    longitude: -97.355,
    open_hours: "{\"mon\": \"08:00-17:00\", \"tue\": \"08:00-17:00\", \"wed\": \"08:00-17:00\", \"thu\": \"08:00-17:00\", \"fri\": \"08:00-17:00\", \"sat\": \"09:00-12:00\", \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Directions Home — City of Fort Worth",
    description: "Fort Worth's homelessness strategy office coordinating housing resources, rapid rehousing, and prevention programs across the city.",
    url: "https://www.fortworthtexas.gov/departments/neighborhood-services/directions-home",
    phone: "(817) 392-5790",
    category: "housing",
    address: "908 Monroe St, Fort Worth, TX 76102",
    latitude: 32.753,
    longitude: -97.331,
    open_hours: "{\"mon\": \"08:00-17:00\", \"tue\": \"08:00-17:00\", \"wed\": \"08:00-17:00\", \"thu\": \"08:00-17:00\", \"fri\": \"08:00-17:00\", \"sat\": null, \"sun\": null}",
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "The Ladder Alliance",
    description: "Technology skills training and job placement services empowering low-income adults in Tarrant County to achieve economic self-sufficiency.",
    url: "https://www.ladderalliance.org",
    phone: "(817) 348-0200",
    category: "workforce",
    address: "2200 James Ave, Fort Worth, TX 76104",
    latitude: 32.72,
    longitude: -97.317,
    open_hours: "{\"mon\": \"08:30-17:30\", \"tue\": \"08:30-17:30\", \"wed\": \"08:30-17:30\", \"thu\": \"08:30-17:30\", \"fri\": \"08:30-17:30\", \"sat\": null, \"sun\": null}",
  },
] as const;


// ── Local Farms & Food Sovereignty Resources (Phase 7c) ─────────────────────────────────────
const TARRANT_FARMS = [
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Cowtown Farmers Market",
    description: "Year-round Saturday market featuring local Texas farmers. Accepts SNAP/EBT with Double Up Food Bucks — spend $20 SNAP, get $20 more on Texas-grown produce. Open Saturdays 8am–12pm.",
    url: "https://www.cowtownfarmersmarket.com",
    phone: "(817) 336-5000",
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Milam's Mushrooms",
    description: "Local Fort Worth mushroom farm offering fresh gourmet and medicinal mushrooms for direct purchase. Specialty varieties grown sustainably in Tarrant County.",
    url: "https://www.milamsmushrooms.com",
    phone: null,
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Texas A&M AgriLife Extension — Tarrant County",
    description: "Free gardening education, food preservation classes, Master Gardener programs, and urban farming resources for Tarrant County residents.",
    url: "https://tarrant.agrilife.org",
    phone: "(817) 884-1945",
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Tarrant County Master Gardeners",
    description: "Volunteer educators who provide research-based gardening information. Offers workshops, plant clinics, and community garden support.",
    url: "https://tarrantmg.org",
    phone: "(817) 884-1945",
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Stop Six Community Garden",
    description: "Community garden in the historic Stop Six neighborhood, East Fort Worth. Open to neighborhood residents. A cornerstone of food sovereignty in one of Fort Worth's most resilient communities.",
    url: "https://www.fortworthtexas.gov/departments/parks",
    phone: "(817) 392-5700",
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Haltom City",
    org_name: "Haltom City Community Garden",
    description: "Accessible community garden plots near North Fort Worth. Low-cost plot rentals available for families wanting to grow their own food.",
    url: "https://www.haltomcitytx.com",
    phone: "(817) 834-6261",
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Presbyterian Night Shelter Garden",
    description: "On-site garden at Presbyterian Night Shelter that produces fresh vegetables for shelter residents. Volunteer opportunities available for community members.",
    url: "https://www.presbyteriannightshelter.org",
    phone: "(817) 632-5400",
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Tarrant County Public Library — Seed Library",
    description: "Free seed lending program at multiple TCPL branches. Check out vegetable, herb, and flower seeds with your library card. Grow food at home and return seeds at harvest to share with neighbors.",
    url: "https://www.tarlibrary.org",
    phone: "(817) 884-1800",
    category: "local_farm",
  },
  {
    state: "TX", county: "Parker", city: "Weatherford",
    org_name: "Clark Gardens Botanical Park",
    description: "Seasonal pick-your-own and community events at this 35-acre botanical park near Fort Worth. Features local plant sales and sustainable gardening demonstrations. About 40 minutes west of Fort Worth.",
    url: "https://www.clarkgardens.org",
    phone: "(940) 682-4856",
    category: "local_farm",
  },
  {
    state: "TX", county: "Dallas", city: "Coppell",
    org_name: "Coppell Farmers Market",
    description: "Saturday market featuring verified local Texas producers. Accepts SNAP/EBT. Fresh seasonal produce, eggs, honey, and specialty foods. About 30 minutes east of Fort Worth.",
    url: "https://www.coppellfarmersmarket.org",
    phone: null,
    category: "local_farm",
  },
  {
    state: "TX", county: "Johnson", city: "Cleburne",
    org_name: "Johnson County Farmers Alliance",
    description: "Direct farm connections from Johnson County farms south of Fort Worth. Connects Mansfield, Everman, Crowley and south Tarrant County residents to local food sources.",
    url: "https://www.jcfarmersalliance.com",
    phone: null,
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Local Line — Texas Farm Directory",
    description: "Online platform connecting Fort Worth families to local Texas farms for weekly produce boxes and CSA subscriptions. Search by ZIP code to find farms delivering near you.",
    url: "https://www.localline.ca/texas",
    phone: null,
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Double Up Food Bucks Texas",
    description: "SNAP/EBT matching program at participating farmers markets across Fort Worth. Spend up to $20 in SNAP on Texas-grown fruits and vegetables and receive matching dollars.",
    url: "https://www.doubleupfoodbuckstexas.org",
    phone: null,
    category: "local_farm",
  },
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "Fort Worth Community Gardens Program",
    description: "City of Fort Worth Parks & Recreation community garden plot program. Waitlist available for residents wanting to grow their own food. Multiple sites across the city.",
    url: "https://www.fortworthtexas.gov/departments/parks/programs/community-garden",
    phone: "(817) 392-5700",
    category: "local_farm",
  },
] as const;

async function seedFarms() {
  console.log("\nSeeding local farms & food sovereignty resources…");
  let inserted = 0;
  let skipped = 0;

  for (const farm of TARRANT_FARMS) {
    const existing = await db
      .select({ id: civicResourcesTable.id })
      .from(civicResourcesTable)
      .where(
        and(
          eq(civicResourcesTable.org_name, farm.org_name),
          eq(civicResourcesTable.state, farm.state),
          eq(civicResourcesTable.county, farm.county)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`  SKIP (exists): ${farm.org_name}`);
      skipped++;
      continue;
    }

    await db.insert(civicResourcesTable).values({
      state: farm.state,
      county: farm.county,
      city: farm.city ?? null,
      org_name: farm.org_name,
      description: farm.description,
      url: farm.url,
      phone: farm.phone ?? null,
      category: farm.category,
    });
    // Note: TARRANT_FARMS entries have no address/latitude/longitude/open_hours —
    // out of scope for this pass, see module doc comment above.
    console.log(`  INSERT: ${farm.org_name}`);
    inserted++;
  }

  console.log(`\nFarms done. ${inserted} inserted, ${skipped} skipped.`);
}

async function seed() {
  console.log("Seeding Fort Worth / Tarrant County civic organizations…");
  let inserted = 0;
  let skipped = 0;

  for (const org of TARRANT_ORGS) {
    const existing = await db
      .select({ id: civicResourcesTable.id })
      .from(civicResourcesTable)
      .where(
        and(
          eq(civicResourcesTable.org_name, org.org_name),
          eq(civicResourcesTable.state, org.state),
          eq(civicResourcesTable.county, org.county)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Backfill geo fields onto rows that already existed before this
      // migration added them (idempotent — always sets to the seed's
      // current values, never appends duplicates).
      await db.update(civicResourcesTable)
        .set({
          address: org.address,
          latitude: org.latitude,
          longitude: org.longitude,
          open_hours: org.open_hours,
        })
        .where(eq(civicResourcesTable.id, existing[0].id));
      console.log(`  SKIP (exists, geo backfilled): ${org.org_name}`);
      skipped++;
      continue;
    }

    await db.insert(civicResourcesTable).values({
      state: org.state,
      county: org.county,
      city: org.city,
      org_name: org.org_name,
      description: org.description,
      url: org.url,
      phone: org.phone,
      category: org.category,
      address: org.address,
      latitude: org.latitude,
      longitude: org.longitude,
      open_hours: org.open_hours,
    });
    console.log(`  INSERT: ${org.org_name}`);
    inserted++;
  }

  console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);
  await seedFarms();
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  pool.end().finally(() => process.exit(1));
});
