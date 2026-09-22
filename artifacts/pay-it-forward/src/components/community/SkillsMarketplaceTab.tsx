import { useState } from "react";
import { Wrench, Award, Globe, Truck, Stethoscope, Zap, Hammer, Monitor, Car, Utensils, Baby } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SKILLS_DIRECTORY = [
  { id: "bilingual",            label: "Bilingual",    Icon: Globe,       desc: "Spanish, Vietnamese, or other language support", cats: ["groceries","errands","medical"] },
  { id: "truck_owner",          label: "Truck Owner",  Icon: Truck,       desc: "Move furniture, haul supplies, or transport large items", cats: ["transportation","errands","stock_shelves"] },
  { id: "medical_background",   label: "Medical",      Icon: Stethoscope, desc: "Healthcare worker, EMT, nurse, or caregiver experience", cats: ["medical","emergency"] },
  { id: "licensed_electrician", label: "Electrician",  Icon: Zap,         desc: "Safe assistance with electrical needs and home repairs", cats: ["home_repair"] },
  { id: "licensed_plumber",     label: "Plumber",      Icon: Wrench,      desc: "Pipe repairs, leak fixes, and plumbing emergencies", cats: ["home_repair"] },
  { id: "carpenter",            label: "Carpenter",    Icon: Hammer,      desc: "Woodworking, furniture assembly, and construction", cats: ["home_repair","event_setup"] },
  { id: "tech_support",         label: "Tech Support", Icon: Monitor,     desc: "Computer setup, smartphone help, device troubleshooting", cats: ["tech_support"] },
  { id: "cdl_driver",           label: "CDL Driver",   Icon: Car,         desc: "Commercial driver's license — large vehicle expertise", cats: ["transportation","delivery_run"] },
  { id: "food_handler",         label: "Food Handler", Icon: Utensils,    desc: "Safe food preparation and handling certified", cats: ["errands","event_setup"] },
  { id: "childcare",            label: "Childcare",    Icon: Baby,        desc: "Experienced in caring for children", cats: ["other"] },
];

const CAT_LABELS: Record<string, string> = {
  groceries: "Groceries", transportation: "Transport", errands: "Errands",
  home_repair: "Home Repair", medical: "Medical", emergency: "Emergency",
  stock_shelves: "Stocking", event_setup: "Events", delivery_run: "Delivery",
  tech_support: "Tech", other: "General",
};

export function SkillsMarketplaceTab() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
        <h3 className="font-black text-sm flex items-center gap-2 mb-1">
          <Wrench className="w-4 h-4 text-primary" /> Skills Directory
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Helpers tag their specialties so requesters find the right person. Skill-matched requests get dispatch priority.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SKILLS_DIRECTORY.map(skill => (
          <motion.button
            key={skill.id}
            onClick={() => setActive(active === skill.id ? null : skill.id)}
            whileTap={{ scale: 0.97 }}
            className={`text-left rounded-2xl border p-3 transition-all ${
              active === skill.id ? "border-primary/60 bg-primary/10" : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className="mb-1.5 h-6 w-6 text-primary flex items-center justify-center">
              <skill.Icon className="h-5 w-5" />
            </div>
            <div className="font-black text-xs">{skill.label}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{skill.desc}</div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {active && SKILLS_DIRECTORY.find(s => s.id === active) && (() => {
          const skill = SKILLS_DIRECTORY.find(s => s.id === active)!;
          return (
            <motion.div
              key={skill.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-card border border-primary/30 rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-primary flex items-center justify-center h-8 w-8 bg-primary/10 rounded-full">
                  <skill.Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-black text-sm">{skill.label}</div>
                  <div className="text-xs text-muted-foreground">{skill.desc}</div>
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Helps With</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {skill.cats.map(cat => (
                  <span key={cat} className="text-[10px] font-bold bg-muted border border-border px-2 py-1 rounded-full">
                    {CAT_LABELS[cat] ?? cat}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Add this skill in Profile → Settings to get matched with relevant requests automatically.
              </p>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <div className="bg-card/50 border border-dashed border-border rounded-2xl p-4 text-center">
        <Award className="w-5 h-5 text-primary/40 mx-auto mb-2" />
        <div className="text-sm font-bold text-muted-foreground">Add skills in Profile Settings</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Skill-matched helpers get priority in dispatch</div>
      </div>
    </div>
  );
}
