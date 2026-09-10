import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Users, Mic, Video, ArrowLeft, Search, WifiOff, Crown, X, Share2, Bell, BellOff } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useCachedList } from "@/hooks/useCachedList";
import { acquireCircleDevice } from "@/lib/circleMediaReadiness";
import { getUsableMapLocation, mapLocationUnavailableMessage } from "@/lib/spiralMapLocation";
import { filterActiveNeighborhoodSpirals, promoteLocalSpiral, SPIRALS_PATHS } from "@/lib/spirals";
import { SpiralMark } from "@/components/SpiralMark";
import { SpiralHostSignal, type HostSignalPayload } from "@/components/SpiralHostSignal";
import { SpiralNeighborhoodCheckpoint, type SpiralLocationContext } from "@/components/SpiralNeighborhoodCheckpoint";

// TEMP_STUB: full Spiral discovery screen is restored in the following commit once blob upload completes.
// Product surface: Niakofa Spirals (Circle routes remain API-compatible aliases).
export default function AudioCirclesScreen() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center gap-3">
      <p className="text-sm font-black">Niakofa Spirals</p>
      <p className="text-xs text-muted-foreground max-w-sm">
        Map Locator is the only location source for neighborhood Spirals. Reload after the restore commit lands.
      </p>
    </div>
  );
}
