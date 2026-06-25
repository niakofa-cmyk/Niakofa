/**
 * Niakofa Seed — Fort Worth / Tarrant County Civic Organizations
 *
 * Seeds 19 civic resources for Tarrant County, TX.
 * Safe to re-run: deduplicates by org_name + state + county.
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
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Presbyterian Night Shelter",
    description: "One of the largest homeless shelters in North Texas, providing emergency shelter, meals, case management, and housing navigation.",
    url: "https://www.presbyteriannightshelter.org",
    phone: "(817) 632-5400",
    category: "housing",
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
  },
  {
    state: "TX",
    county: "Tarrant",
    city: "Fort Worth",
    org_name: "Meals on Wheels of Tarrant County",
    description: "Delivers nutritious meals and friendly visits to homebound seniors and adults with disabilities across Tarrant County.",
    url: "https://www.mowta.com",
    phone: "(817) 336-0912",
    category: "seniors",
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
  },
] as const;

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
      console.log(`  SKIP (exists): ${org.org_name}`);
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
    });
    console.log(`  INSERT: ${org.org_name}`);
    inserted++;
  }

  console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  pool.end().finally(() => process.exit(1));
});
