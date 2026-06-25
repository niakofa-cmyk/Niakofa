// LanguageSelector — Phase 7b
// Lets users set their preferred Niakofa language

import React from "react";
import { CulturalLanguage, CULTURAL_PROFILES } from "../lib/culturalGreetings";

const LANGUAGE_LABELS: Record<CulturalLanguage, string> = {
  en: "English",
  sw: "Kiswahili",
  zu: "isiZulu",
  tw: "Twi (Akan)",
  yo: "Yorùbá",
  ha: "Hausa",
  am: "አማርኛ (Amharic)",
  so: "Soomaali",
};

interface LanguageSelectorProps {
  value: CulturalLanguage;
  onChange: (lang: CulturalLanguage) => void;
  className?: string;
}

export function LanguageSelector({ value, onChange, className = "" }: LanguageSelectorProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="text-sm font-medium text-gray-700">
        Nia Language / Lugha ya Nia
      </label>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(LANGUAGE_LABELS) as CulturalLanguage[]).map((lang) => {
          const profile = CULTURAL_PROFILES[lang];
          return (
            <button
              key={lang}
              type="button"
              onClick={() => onChange(lang)}
              className={`flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all ${
                value === lang
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="font-medium text-sm">{LANGUAGE_LABELS[lang]}</span>
              <span className="text-xs opacity-60 mt-0.5">{profile.greeting}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
