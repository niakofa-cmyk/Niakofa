import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/legacy-engine", "");

    if (path === "/completeness" && req.method === "GET") {
      const familyId = url.searchParams.get("familyId");
      if (!familyId) {
        return new Response(JSON.stringify({ error: "familyId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [members, memories, events, places, interviews] = await Promise.all([
        supabase.from("family_members").select("*").eq("family_id", familyId),
        supabase.from("family_memories").select("*").eq("family_id", familyId),
        supabase.from("family_events").select("*").eq("family_id", familyId),
        supabase.from("family_places").select("*").eq("family_id", familyId),
        supabase.from("family_interviews").select("*").eq("family_id", familyId),
      ]);

      const peopleScore = Math.min((members.data?.length || 0) / 5, 1) * 20;
      const eventsScore = Math.min((events.data?.length || 0) / 6, 1) * 20;
      const storiesScore = Math.min((memories.data?.length || 0) / 10, 1) * 20;
      const placesScore = Math.min((places.data?.length || 0) / 4, 1) * 15;
      const consentScore = Math.min(
        (members.data || []).filter((m: any) => m.storytelling_consent).length /
          Math.max(members.data?.length || 1, 1),
        1,
      ) * 10;
      const relationsScore = Math.min((members.data || []).length > 1 ? 1 : 0, 1) * 15;

      const total = Math.round(
        peopleScore + eventsScore + storiesScore + placesScore + consentScore + relationsScore,
      );

      return new Response(
        JSON.stringify({
          familyId,
          readinessScore: total,
          chapterUnlockReady: total >= 40,
          threshold: 40,
          counts: {
            members: members.data?.length || 0,
            memories: memories.data?.length || 0,
            events: events.data?.length || 0,
            places: places.data?.length || 0,
            interviews: interviews.data?.length || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (path === "/knowledge-version" && req.method === "POST") {
      const { familyId } = await req.json();
      if (!familyId) {
        return new Response(JSON.stringify({ error: "familyId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [members, memories, events, places, interviews, artifacts] = await Promise.all([
        supabase.from("family_members").select("id,updated_at").eq("family_id", familyId),
        supabase.from("family_memories").select("id,updated_at").eq("family_id", familyId),
        supabase.from("family_events").select("id,updated_at").eq("family_id", familyId),
        supabase.from("family_places").select("id,created_at").eq("family_id", familyId),
        supabase.from("family_interviews").select("id,created_at").eq("family_id", familyId),
        supabase.from("family_artifacts").select("id,created_at").eq("family_id", familyId),
      ]);

      const hashData = JSON.stringify({
        members: (members.data || []).map((m: any) => m.id + m.updated_at).sort(),
        memories: (memories.data || []).map((m: any) => m.id + m.updated_at).sort(),
        events: (events.data || []).map((e: any) => e.id + e.updated_at).sort(),
        places: (places.data || []).map((p: any) => p.id + p.created_at).sort(),
        interviews: (interviews.data || []).map((i: any) => i.id + i.created_at).sort(),
        artifacts: (artifacts.data || []).map((a: any) => a.id + a.created_at).sort(),
      });

      const encoder = new TextEncoder();
      const buffer = encoder.encode(hashData);
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { data: latest } = await supabase
        .from("family_knowledge_versions")
        .select("version_number,knowledge_hash")
        .eq("family_id", familyId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (latest?.version_number || 0) + 1;
      const isChanged = !latest || latest.knowledge_hash !== hash;

      if (isChanged) {
        await supabase.from("family_knowledge_versions").insert({
          family_id: familyId,
          version_number: nextVersion,
          knowledge_hash: hash,
          member_count: members.data?.length || 0,
          memory_count: memories.data?.length || 0,
          interview_count: interviews.data?.length || 0,
          place_count: places.data?.length || 0,
          event_count: events.data?.length || 0,
          artifact_count: artifacts.data?.length || 0,
          change_description: `Knowledge version ${nextVersion}`,
        });
      }

      return new Response(
        JSON.stringify({
          familyId,
          hash,
          version: nextVersion,
          changed: isChanged,
          previousVersion: latest?.version_number || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
