import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPERADMIN_EMAIL = "jlatham@elitert.com";

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { action } = body;

  // ─── ADMIN LOGIN ─────────────────────────────────────────
  if (action === "admin_login") {
    const { email, passcode } = body;
    if (!email || !passcode) return json({ error: "Email and passcode required" }, 400);

    const { data, error } = await supabase
      .from("allowed_admins")
      .select("id, name, email, passcode")
      .eq("email", email.toLowerCase().trim())
      .eq("passcode", passcode)
      .maybeSingle();

    if (error || !data) return json({ error: "Invalid credentials" }, 401);

    const token = generateToken();
    const expires_at = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await supabase.from("admin_sessions").insert({ token, email: data.email, expires_at });

    return json({ token, name: data.name, email: data.email, role: "admin" });
  }

  // ─── MEMBER LOGIN ────────────────────────────────────────
  if (action === "member_login") {
    const { email, passcode } = body;
    if (!email || !passcode) return json({ error: "Email and passcode required" }, 400);

    const { data, error } = await supabase
      .from("member_logins")
      .select("id, name, email, member_number")
      .eq("email", email.toLowerCase().trim())
      .eq("passcode", passcode)
      .maybeSingle();

    if (error || !data) return json({ error: "Invalid credentials" }, 401);

    const token = generateToken();
    const expires_at = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await supabase.from("admin_sessions").insert({ token, email: data.email, expires_at });

    return json({ token, name: data.name, email: data.email, role: "member", member_number: data.member_number });
  }

  // ─── LEGACY LOGIN (backward compat) ──────────────────────
  if (action === "login") {
    const { email, passcode } = body;
    if (!email || !passcode) return json({ error: "Email and passcode required" }, 400);

    const { data, error } = await supabase
      .from("allowed_admins")
      .select("id, name, email, role, member_number")
      .eq("email", email.toLowerCase().trim())
      .eq("passcode", passcode)
      .maybeSingle();

    if (error || !data) return json({ error: "Invalid credentials" }, 401);

    const token = generateToken();
    const expires_at = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await supabase.from("admin_sessions").insert({ token, email: data.email, expires_at });

    return json({ token, name: data.name, email: data.email, role: data.role || "admin", member_number: data.member_number });
  }

  // ─── VERIFY TOKEN FOR ALL OTHER ACTIONS ──────────────────
  const token = body.token;
  if (!token) return json({ error: "Unauthorized — please log in again" }, 401);

  const { data: session } = await supabase
    .from("admin_sessions")
    .select("email, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) await supabase.from("admin_sessions").delete().eq("token", token);
    return json({ error: "Unauthorized — please log in again" }, 401);
  }

  // ─── READ DATA ───────────────────────────────────────────
  if (action === "load_data") {
    const [experts, ecosystems, ciq, members, exclusions] = await Promise.all([
      supabase.from("experts").select("*").order("name"),
      supabase.from("vfo_ecosystem_assignments").select("*"),
      supabase.from("ciq_assignments").select("*"),
      supabase.from("members").select("*").order("name"),
      supabase.from("member_exclusions").select("*"),
    ]);
    return json({
      experts: experts.data || [],
      ecosystems: ecosystems.data || [],
      ciq: ciq.data || [],
      members: members.data || [],
      exclusions: exclusions.data || [],
    });
  }

  // ─── SAVE SPECIALIST ─────────────────────────────────────
  if (action === "save_specialist") {
    const { expert, ecosystems, ciq, editing_id } = body;
    let eid: number;

    if (editing_id) {
      const { error } = await supabase.from("experts").update(expert).eq("id", editing_id);
      if (error) return json({ error: error.message }, 500);
      eid = editing_id;
    } else {
      const { data, error } = await supabase.from("experts").insert(expert).select().single();
      if (error) return json({ error: error.message }, 500);
      eid = data.id;
    }

    await supabase.from("vfo_ecosystem_assignments").delete().eq("expert_id", eid);
    await supabase.from("ciq_assignments").delete().eq("expert_id", eid);

    if (ecosystems && ecosystems.length > 0) {
      await supabase.from("vfo_ecosystem_assignments").insert(
        ecosystems.map((e: string) => ({ expert_id: eid, name: e }))
      );
    }
    if (ciq && ciq.length > 0) {
      await supabase.from("ciq_assignments").insert(
        ciq.map((c: string) => ({ expert_id: eid, name: c }))
      );
    }

    return json({ success: true, expert_id: eid });
  }

  // ─── DELETE SPECIALIST ───────────────────────────────────
  if (action === "delete_specialist") {
    const { expert_id } = body;
    await supabase.from("vfo_assignments").delete().eq("expert_id", expert_id);
    await supabase.from("member_exclusions").delete().eq("expert_id", expert_id);
    await supabase.from("vfo_ecosystem_assignments").delete().eq("expert_id", expert_id);
    await supabase.from("ciq_assignments").delete().eq("expert_id", expert_id);
    await supabase.from("experts").delete().eq("id", expert_id);
    return json({ success: true });
  }

  // ─── UPLOAD HEADSHOT ─────────────────────────────────────
  if (action === "upload_headshot") {
    const { filename, file_base64, content_type } = body;
    const bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from("headshots")
      .upload(filename, bytes, { contentType: content_type, upsert: true });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // ─── SAVE MEMBER SETTINGS ───────────────────────────────
  if (action === "save_member") {
    const { member_number, settings, exclusions } = body;

    const { error } = await supabase
      .from("members")
      .update(settings)
      .eq("member_number", member_number);
    if (error) return json({ error: error.message }, 500);

    await supabase.from("member_exclusions").delete().eq("member_number", member_number);
    if (exclusions && exclusions.length > 0) {
      await supabase.from("member_exclusions").insert(
        exclusions.map((eid: number) => ({ member_number, expert_id: eid }))
      );
    }

    return json({ success: true });
  }

  // ─── LOAD MEMBER EXCLUSIONS ─────────────────────────────
  if (action === "load_exclusions") {
    const { member_number } = body;
    const { data, error } = await supabase
      .from("member_exclusions")
      .select("*")
      .eq("member_number", member_number);
    if (error) return json({ error: error.message }, 500);
    return json({ exclusions: data || [] });
  }

  // ─── ADD MEMBER ──────────────────────────────────────────
  if (action === "add_member") {
    const { name, member_number } = body;
    if (!name || !member_number) return json({ error: "Name and member number are required" }, 400);

    const { data: existing } = await supabase
      .from("members")
      .select("member_number")
      .eq("member_number", member_number)
      .maybeSingle();
    if (existing) return json({ error: "Member number already exists" }, 400);

    const keyArr = new Uint8Array(12);
    crypto.getRandomValues(keyArr);
    const manage_key = Array.from(keyArr, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);

    const { data, error } = await supabase.from("members").insert({
      name,
      member_number,
      manage_key,
      primary_color: "#d4af37",
      bg_color: "#0a1628",
      text_color: "#ffffff",
      card_text_color: "#ffffff",
      accent_color: "#1a2744",
      last_initial_only: false,
      display_mode: "filter",
      font: "Playfair Display",
      show_count: true,
      show_search: true
    }).select().single();

    if (error) return json({ error: error.message }, 500);
    return json({ success: true, member: data });
  }

  // ─── DELETE MEMBER ─────────────────────────────────────
  if (action === "delete_member") {
    const { member_number } = body;
    if (!member_number) return json({ error: "Member number is required" }, 400);

    await supabase.from("member_exclusions").delete().eq("member_number", member_number);
    await supabase.from("member_logins").delete().eq("member_number", member_number);
    const { error } = await supabase.from("members").delete().eq("member_number", member_number);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // ─── LOAD ADMINS (superadmin only) ───────────────────────
  if (action === "load_admins") {
    if (session.email !== SUPERADMIN_EMAIL) return json({ error: "Unauthorized" }, 403);
    const { data, error } = await supabase
      .from("allowed_admins")
      .select("id, name, email, created_at")
      .order("name");
    if (error) return json({ error: error.message }, 500);
    return json({ admins: data || [] });
  }

  // ─── CREATE ADMIN (superadmin only) ──────────────────────
  if (action === "create_admin") {
    if (session.email !== SUPERADMIN_EMAIL) return json({ error: "Unauthorized" }, 403);
    const { email, name, passcode } = body;
    if (!email || !name || !passcode) return json({ error: "Email, name, and passcode are required" }, 400);

    const { data: existing } = await supabase
      .from("allowed_admins")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();
    if (existing) return json({ error: "Admin with this email already exists" }, 400);

    const { data, error } = await supabase.from("allowed_admins").insert({
      email: email.toLowerCase().trim(),
      name,
      passcode,
      role: "admin"
    }).select().single();

    if (error) return json({ error: error.message }, 500);
    return json({ success: true, admin: data });
  }

  // ─── DELETE ADMIN (superadmin only) ──────────────────────
  if (action === "delete_admin") {
    if (session.email !== SUPERADMIN_EMAIL) return json({ error: "Unauthorized" }, 403);
    const { admin_id } = body;
    if (!admin_id) return json({ error: "Admin ID is required" }, 400);

    // Prevent deleting yourself
    const { data: target } = await supabase.from("allowed_admins").select("email").eq("id", admin_id).maybeSingle();
    if (target && target.email === SUPERADMIN_EMAIL) return json({ error: "Cannot delete superadmin" }, 400);

    const { error } = await supabase.from("allowed_admins").delete().eq("id", admin_id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  return json({ error: "Unknown action: " + action }, 400);
});
