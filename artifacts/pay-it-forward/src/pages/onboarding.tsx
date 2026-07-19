import { useState , useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MapPin, Bell, Shield, ChevronRight, Check, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/lib/AppContext";
import { subscribeToPush } from "@/lib/push";
import { useUpdateUser } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";

interface Step {
  id: string;
  icon: typeof Heart;
  title: string;
  description: string;
  color: string;
  action?: string;
}

const STEPS: Step[] = [
  {
    id: "welcome",
    icon: Heart,
    title: "Welcome to Niakofa",
    description: "A community platform where neighbors help neighbors. Request help, offer help, and pay it forward when you're able.",
    color: "text-primary",
    action: "Get Started",
  },
  {
    id: "location",
    icon: MapPin,
    title: "Enable Location",
    description: "Niakofa uses your location to show nearby requests and helpers. Your exact location is never shared publicly.",
    color: "text-yellow-400",
    action: "Allow Location",
  },
  {
    id: "notifications",
    icon: Bell,
    title: "Stay Notified",
    description: "Get instant alerts when someone nearby needs help, or when a helper accepts your request.",
    color: "text-green-400",
    action: "Enable Notifications",
  },
  {
    id: "city",
    icon: Building2,
    title: "Your City",
    description: "Tell Nia where you are so she can surface local resources, food banks, shelters, and support programs near you — even before GPS activates.",
    color: "text-blue-400",
    action: "Save My City",
  },
  {
    id: "trust",
    icon: Shield,
    title: "Community Trust",
    description: "Niakofa uses a trust tier system. The more you help, the higher your tier — unlocking emergency requests and community recognition.",
    color: "text-purple-400",
    action: "I Understand",
  },
];

// Global city suggestions — sorted by community priority (African cities, diaspora
// hubs, and underserved US communities first, then broader global coverage).
// This is a living list — add cities as Niakofa expands to new regions.
const GLOBAL_CITY_SUGGESTIONS = [
  // ── West Africa ───────────────────────────────────────────────────────────
  "Lagos, Nigeria", "Abuja, Nigeria", "Kano, Nigeria", "Ibadan, Nigeria",
  "Accra, Ghana", "Kumasi, Ghana", "Tamale, Ghana",
  "Dakar, Senegal", "Abidjan, Côte d'Ivoire", "Yamoussoukro, Côte d'Ivoire",
  "Conakry, Guinea", "Freetown, Sierra Leone", "Monrovia, Liberia",
  "Banjul, Gambia", "Bissau, Guinea-Bissau", "Bamako, Mali",
  "Ouagadougou, Burkina Faso", "Niamey, Niger", "Cotonou, Benin",
  "Lomé, Togo", "Nouakchott, Mauritania", "Praia, Cape Verde",
  // ── East Africa ───────────────────────────────────────────────────────────
  "Nairobi, Kenya", "Mombasa, Kenya", "Kisumu, Kenya", "Nakuru, Kenya",
  "Kampala, Uganda", "Gulu, Uganda", "Mbarara, Uganda",
  "Dar es Salaam, Tanzania", "Arusha, Tanzania", "Dodoma, Tanzania",
  "Addis Ababa, Ethiopia", "Gondar, Ethiopia", "Mekelle, Ethiopia",
  "Kigali, Rwanda", "Gitega, Burundi", "Bujumbura, Burundi",
  "Mogadishu, Somalia", "Hargeisa, Somaliland",
  "Juba, South Sudan", "Khartoum, Sudan",
  "Djibouti City, Djibouti", "Asmara, Eritrea",
  // ── Central Africa ────────────────────────────────────────────────────────
  "Kinshasa, DRC", "Lubumbashi, DRC", "Goma, DRC", "Bukavu, DRC",
  "Brazzaville, Congo", "Douala, Cameroon", "Yaoundé, Cameroon",
  "Bangui, Central African Republic", "N'Djamena, Chad",
  "Libreville, Gabon", "Malabo, Equatorial Guinea",
  // ── Southern Africa ───────────────────────────────────────────────────────
  "Johannesburg, South Africa", "Cape Town, South Africa", "Durban, South Africa",
  "Pretoria, South Africa", "Soweto, South Africa",
  "Harare, Zimbabwe", "Bulawayo, Zimbabwe",
  "Lusaka, Zambia", "Lilongwe, Malawi", "Blantyre, Malawi",
  "Maputo, Mozambique", "Beira, Mozambique",
  "Gaborone, Botswana", "Windhoek, Namibia",
  "Mbabane, Eswatini", "Maseru, Lesotho",
  "Antananarivo, Madagascar", "Port Louis, Mauritius",
  // ── North Africa ──────────────────────────────────────────────────────────
  "Cairo, Egypt", "Alexandria, Egypt", "Casablanca, Morocco",
  "Marrakech, Morocco", "Tunis, Tunisia", "Algiers, Algeria",
  "Tripoli, Libya", "Benghazi, Libya",
  // ── Caribbean (diaspora priority) ─────────────────────────────────────────
  "Port-au-Prince, Haiti", "Cap-Haïtien, Haiti", "Gonaïves, Haiti",
  "Kingston, Jamaica", "Montego Bay, Jamaica", "Spanish Town, Jamaica",
  "Santo Domingo, Dominican Republic", "Santiago, Dominican Republic",
  "San Juan, Puerto Rico", "Bridgetown, Barbados",
  "Port of Spain, Trinidad and Tobago", "Nassau, Bahamas",
  "Georgetown, Guyana", "Paramaribo, Suriname",
  "Havana, Cuba", "Santiago de Cuba, Cuba",
  // ── Central America ───────────────────────────────────────────────────────
  "Guatemala City, Guatemala", "San Salvador, El Salvador",
  "Tegucigalpa, Honduras", "San Pedro Sula, Honduras",
  "Managua, Nicaragua", "San José, Costa Rica", "Panama City, Panama",
  // ── South America ─────────────────────────────────────────────────────────
  "São Paulo, Brazil", "Rio de Janeiro, Brazil", "Salvador, Brazil",
  "Fortaleza, Brazil", "Recife, Brazil", "Manaus, Brazil",
  "Bogotá, Colombia", "Medellín, Colombia", "Cali, Colombia",
  "Lima, Peru", "Caracas, Venezuela", "Quito, Ecuador",
  "La Paz, Bolivia", "Asunción, Paraguay", "Montevideo, Uruguay",
  "Buenos Aires, Argentina", "Santiago, Chile",
  // ── US — underserved community hubs (Black, immigrant, low-income) ────────
  "Atlanta, GA", "Decatur, GA", "Stone Mountain, GA",
  "Fort Worth, TX", "Dallas, TX", "Houston, TX", "San Antonio, TX",
  "Austin, TX", "El Paso, TX", "Laredo, TX",
  "Chicago, IL", "Harvey, IL", "Robbins, IL",
  "Detroit, MI", "Flint, MI", "Saginaw, MI",
  "Memphis, TN", "Nashville, TN", "Knoxville, TN",
  "New Orleans, LA", "Baton Rouge, LA", "Shreveport, LA",
  "Baltimore, MD", "Prince George's County, MD",
  "Washington, DC", "Anacostia, DC",
  "Philadelphia, PA", "Camden, NJ", "Trenton, NJ",
  "New York City, NY", "Bronx, NY", "Brooklyn, NY", "Harlem, NY",
  "Newark, NJ", "Jersey City, NJ",
  "Miami, FL", "Jacksonville, FL", "Tampa, FL", "Orlando, FL",
  "Birmingham, AL", "Selma, AL", "Montgomery, AL",
  "Jackson, MS", "Greenville, MS",
  "Richmond, VA", "Norfolk, VA", "Newport News, VA",
  "Charlotte, NC", "Durham, NC", "Raleigh, NC", "Greensboro, NC",
  "Columbia, SC", "Charleston, SC",
  "Little Rock, AR", "Pine Bluff, AR",
  "Cleveland, OH", "Cincinnati, OH", "Columbus, OH",
  "Indianapolis, IN", "Gary, IN",
  "Kansas City, MO", "St. Louis, MO", "East St. Louis, IL",
  "Minneapolis, MN", "Saint Paul, MN", "Brooklyn Center, MN",
  "Milwaukee, WI", "Racine, WI",
  "Denver, CO", "Aurora, CO",
  "Phoenix, AZ", "Tucson, AZ", "Yuma, AZ",
  "Los Angeles, CA", "Compton, CA", "Watts, CA", "South Central, CA",
  "Oakland, CA", "Richmond, CA", "East Palo Alto, CA",
  "San Francisco, CA", "San Jose, CA", "Sacramento, CA",
  "San Diego, CA", "National City, CA",
  "Fresno, CA", "Bakersfield, CA", "Stockton, CA",
  "Portland, OR", "Salem, OR",
  "Seattle, WA", "Tacoma, WA", "Spokane, WA",
  "Albuquerque, NM", "Las Cruces, NM",
  "Las Vegas, NV", "North Las Vegas, NV",
  "Omaha, NE", "Lincoln, NE",
  "Wichita, KS", "Topeka, KS",
  "Louisville, KY", "Lexington, KY",
  "Anchorage, AK", "Honolulu, HI",
  // ── UK / Europe diaspora ─────────────────────────────────────────────────
  "London, UK", "Birmingham, UK", "Manchester, UK", "Leeds, UK",
  "Bristol, UK", "Leicester, UK", "Nottingham, UK",
  "Paris, France", "Lyon, France", "Marseille, France",
  "Brussels, Belgium", "Antwerp, Belgium",
  "Amsterdam, Netherlands", "Rotterdam, Netherlands",
  "Lisbon, Portugal", "Porto, Portugal",
  "Madrid, Spain", "Barcelona, Spain",
  "Rome, Italy", "Milan, Italy",
  "Berlin, Germany", "Hamburg, Germany", "Frankfurt, Germany",
  // ── Middle East / Arab World ──────────────────────────────────────────────
  "Dubai, UAE", "Abu Dhabi, UAE", "Sharjah, UAE",
  "Riyadh, Saudi Arabia", "Jeddah, Saudi Arabia",
  "Amman, Jordan", "Beirut, Lebanon", "Baghdad, Iraq",
  "Istanbul, Turkey", "Ankara, Turkey",
  // ── Asia / South Asia ────────────────────────────────────────────────────
  "Mumbai, India", "Delhi, India", "Chennai, India", "Kolkata, India",
  "Karachi, Pakistan", "Lahore, Pakistan", "Islamabad, Pakistan",
  "Dhaka, Bangladesh", "Kathmandu, Nepal",
  "Colombo, Sri Lanka", "Manila, Philippines",
  // ── Canada diaspora hubs ──────────────────────────────────────────────────
  "Toronto, Canada", "Brampton, Canada", "Mississauga, Canada",
  "Ottawa, Canada", "Montreal, Canada", "Calgary, Canada",
  "Vancouver, Canada", "Edmonton, Canada",
  // ── Oceania ───────────────────────────────────────────────────────────────
  "Sydney, Australia", "Melbourne, Australia", "Brisbane, Australia",
  "Auckland, New Zealand",
];

export default function OnboardingScreen() {
  const [, setLocation] = useLocation();
  const { currentUser, userPlace } = useAppContext();
  const [step, setStep] = useState(0);
  const [locationGranted, setLocationGranted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [cityInput, setCityInput] = useState(() => {
    // Pre-fill from GPS-resolved city if available
    try { return localStorage.getItem("niakofa_user_city") ?? ""; } catch { return ""; }
  });
  const [citySaved, setCitySaved] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const updateUser = useUpdateUser();

  const current = STEPS[step];

  const handleCityInput = (val: string) => {
    setCityInput(val);
    if (val.length >= 2) {
      const lower = val.toLowerCase();
      const matches = GLOBAL_CITY_SUGGESTIONS.filter(c =>
        c.toLowerCase().includes(lower)
      ).slice(0, 7);
      setCitySuggestions(matches);
    } else {
      setCitySuggestions([]);
    }
  };

  const handleAction = async () => {
    setLoading(true);

    if (current.id === "location") {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => setLocationGranted(true),
          () => setLocationGranted(false),
          { timeout: 5000 }
        );
      }
    }

    if (current.id === "notifications" && currentUser) {
      try {
        await subscribeToPush(currentUser.id);
        setNotifGranted(true);
      } catch {}
    }

    if (current.id === "city" && currentUser && cityInput.trim()) {
      try {
        await updateUser.mutateAsync({
          id: currentUser.id,
          data: { city: cityInput.trim() },
        });
        // Store city locally so Nia can use it immediately
        try { localStorage.setItem("niakofa_user_city", cityInput.trim()); } catch {}
        // Set global window var for map.tsx crisis region lookup
        (window as unknown as { __niakofaRegion?: string }).__niakofaRegion = cityInput.trim();
        // If GPS place has county data, also store that for richer Nia context
        if (userPlace?.county) {
          try { localStorage.setItem("niakofa_user_county", userPlace.county); } catch {}
        }
        setCitySaved(true);
      } catch {
        // Save failed — store locally so Nia still has context, but notify user
        try { localStorage.setItem("niakofa_user_city", cityInput.trim()); } catch {}
        toast({
          title: "Couldn't save city to your profile",
          description: "Your city is saved locally for this session. You can update it later in your profile settings.",
          variant: "destructive",
        });
      }
    }

    setLoading(false);

    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      localStorage.setItem("niakofa_onboarded", "1");
      setLocation("/");
    }
  };

  const skip = () => {
    localStorage.setItem("niakofa_onboarded", "1");
    setLocation("/");
  };

  const Icon = current.icon;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-safe pt-6 pb-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/50" : "w-4 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Skip */}
      <div className="flex justify-end px-4">
        <button onClick={skip} className="text-xs text-muted-foreground px-3 py-2 active:text-foreground transition-colors">
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex flex-col items-center text-center w-full max-w-xs"
          >
            <div className={`w-24 h-24 rounded-full bg-card border-2 border-border flex items-center justify-center mb-8 shadow-lg`}>
              <Icon className={`w-12 h-12 ${current.color}`} />
            </div>

            <h2 className="text-2xl font-black mb-4 leading-tight">{current.title}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-xs mb-4">{current.description}</p>

            {/* City input — only on city step */}
            {current.id === "city" && (
              <div className="w-full mt-2 relative">
                <Input
                  placeholder="e.g. Atlanta, GA"
                  value={cityInput}
                  onChange={(e) => handleCityInput(e.target.value)}
                  className="h-12 text-base text-center"
                  autoComplete="off"
                  autoFocus
                />
                {citySuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-card border border-border rounded-lg shadow-xl mt-1 overflow-hidden">
                    {citySuggestions.map((city) => (
                      <button
                        key={city}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-muted active:bg-muted transition-colors border-b border-border last:border-0"
                        onClick={() => { setCityInput(city); setCitySuggestions([]); }}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Permission granted indicators */}
            {current.id === "location" && locationGranted && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2 mt-4 text-green-400 text-sm font-bold"
              >
                <Check className="w-4 h-4" /> Location enabled
              </motion.div>
            )}
            {current.id === "notifications" && notifGranted && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2 mt-4 text-green-400 text-sm font-bold"
              >
                <Check className="w-4 h-4" /> Notifications enabled
              </motion.div>
            )}
            {current.id === "city" && citySaved && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2 mt-4 text-green-400 text-sm font-bold"
              >
                <Check className="w-4 h-4" /> City saved!
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pb-safe pb-8 space-y-3">
        <Button
          className="w-full h-14 font-black text-base gap-2"
          onClick={handleAction}
          disabled={loading || (current.id === "city" && !cityInput.trim())}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {current.action}
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </Button>
        {(current.id === "location" || current.id === "notifications" || current.id === "city") && (
          <button
            onClick={() => setStep(s => s + 1)}
            className="w-full text-sm text-muted-foreground py-2 active:text-foreground transition-colors"
          >
            {current.id === "city" ? "Skip for now" : "Not now"}
          </button>
        )}
      </div>
    </div>
  );
}
