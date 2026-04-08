var API_URL = "https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api";
var SUPABASE_URL = "https://ejpsprsmhpufwogbmxjv.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqcHNwcnNtaHB1ZndvZ2JteGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDcwNjksImV4cCI6MjA4NzYyMzA2OX0.sdMVsnXePSH8zgstt82O1dhpMxYZq5QivyIrCHMbECU";
var HEADSHOT_BASE = "https://biz-diagnostic.com/img/expert/";
var HEADSHOT_SUPABASE = "https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/";
var ECOSYSTEMS = ["Tax Planning", "Business Advisory", "Legal", "Insurance", "Wealth Management"];
var CIQ_TOPICS = ["1031 Exchange Review","179D Commercial Building Tax Deduction Review","401(k) Review","Advanced Business Tax Strategies Review","Advanced Personal Tax Strategies Review","Asset Protection Review","Business Continuation Planning Review","Business Entity Structure Review","Business Exit Planning Review","Business Finance & Costs - Banking Review","Business Finance & Costs - Merchant Processing (Credit Card Fees) Review","Business Growth - Revenue Generation Review","Business Planning Review","Business Valuation Review","Buy-Sell Agreement Review","Captive Insurance Review","Cash Balance Plan Review","Charitable Planning Review","Compensation & Benefits Review","Cost Recovery Review (Cost Segregation)","Cyber Insurance Review","Deferred Compensation Plan Review","Disability Income Protection Review","Employment Practices Liability Insurance (EPLI) Review","Estate Planning Review","Executive Benefits Review","Group Health Insurance Review","Guaranteed Asset Protection Gap Insurance Review","International Tax Strategies Review","Key Person Insurance Review","Leadership / Culture Review","Life Insurance Review","Life Settlements Review","Long-term Care Review","Merchant Processing (credit cards) Review","Opportunity Zones Review","Outsourced Bookkeeping, CFO and Tax Professionals Review","Outsourced CEO Review","Premium Finance Review","Property & Casualty Insurance Review","Qualified Plans Review","R&D Tax Credit Review","Real Estate Review","Risk Mitigation & Insurance Review","Sales Tax Exemption Review","SDIRA / Alternative Investments Review","Section 125 / Health Insurance Review","Solar Investment Review","Student Loan Repayment / Tuition Reimbursement Review","Surety Bonds Review","Tax Planning Review","Tax Resolution Review","Trust Review","Workers Compensation Review"];
var PRESET_FONTS = ["Playfair Display","Lora","Merriweather","Raleway","Montserrat","Open Sans","Poppins","Cormorant Garamond","Libre Baskerville","Source Serif Pro"];

var authToken = null;
var allExperts = [], ecoMap = {}, ciqMap = {}, allMembers = [];

// ─── API HELPER ────────────────────────────────────────
async function apiCall(body) {
  body.token = authToken;
  var res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPABASE_KEY },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error("Network error — could not reach server.");
  }
  var data = await res.json();
  if (!res.ok) {
    if (res.status === 401) { signOut(); throw new Error("Session expired — please log in again."); }
    throw new Error(data.error || "Request failed");
  }
  return data;
}

// ─── LOAD DATA ─────────────────────────────────────────
var allExclusionMap = {};

async function loadAllData() {
  var maxRetries = 3;
  for (var attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      var data = await apiCall({ action: "load_data" });
      if (data.experts && data.experts.length > 0) {
        allExperts = data.experts; allMembers = data.members;
        ecoMap = {}; ciqMap = {}; allExclusionMap = {};
        data.ecosystems.forEach(function(e) { if (!ecoMap[e.expert_id]) ecoMap[e.expert_id] = []; ecoMap[e.expert_id].push(e.name); });
        data.ciq.forEach(function(c) { if (!ciqMap[c.expert_id]) ciqMap[c.expert_id] = []; ciqMap[c.expert_id].push(c.name); });
        (data.exclusions || []).forEach(function(ex) { if (!allExclusionMap[ex.member_number]) allExclusionMap[ex.member_number] = []; allExclusionMap[ex.member_number].push(ex.expert_id); });
        return;
      }
      if (attempt < maxRetries) await new Promise(function(r) { setTimeout(r, 2000); });
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(function(r) { setTimeout(r, 2000); });
    }
  }
  throw new Error("Could not load data after " + maxRetries + " attempts");
}

// ─── SIGN OUT ──────────────────────────────────────────
function signOut() {
  authToken = null;
  // Redirect to index (role picker)
  window.location.href = "index.html";
}

// ─── LOGIN ─────────────────────────────────────────────
function setupLogin(expectedRole) {
  var loginBtn = document.getElementById("loginBtn");
  var emailInput = document.getElementById("emailInput");
  var passcodeInput = document.getElementById("passcodeInput");
  var loginAction = expectedRole === "member" ? "member_login" : "admin_login";

  async function doLogin() {
    var email = emailInput.value.trim();
    var passcode = passcodeInput.value;
    if (!email || !passcode) { document.getElementById("gateError").style.display = "block"; return; }
    loginBtn.disabled = true; loginBtn.textContent = "Signing in...";
    try {
      var res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPABASE_KEY },
        body: JSON.stringify({ action: loginAction, email: email, passcode: passcode })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      authToken = data.token;
      document.getElementById("gate").style.display = "none";
      document.getElementById("gateError").style.display = "none";
      // Call the page-specific init
      if (typeof onLoginSuccess === "function") onLoginSuccess(data);
    } catch (err) {
      document.getElementById("gateError").textContent = err.message;
      document.getElementById("gateError").style.display = "block";
    } finally {
      loginBtn.disabled = false; loginBtn.textContent = "Sign In";
    }
  }

  loginBtn.addEventListener("click", doLogin);
  passcodeInput.addEventListener("keydown", function(e) { if (e.key === "Enter") doLogin(); });
  emailInput.addEventListener("keydown", function(e) { if (e.key === "Enter") passcodeInput.focus(); });
}

// ─── STATUS HELPER ─────────────────────────────────────
function showStatus(id, type, msg) {
  var el = document.getElementById(id);
  el.className = "status-msg " + type;
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(function() { el.style.display = "none"; }, 5000);
}

// ─── MEMBER SETTINGS UI (shared between admin editing a member and member self-service) ───
var currentMember = null, memberSettings = {}, originalSettings = {};
var memberExclusions = new Set(), originalExclusions = new Set();

function renderMemberSpecialists(filter) {
  var list = document.getElementById("mSpecialistList"); list.innerHTML = "";
  var q = (filter || "").toLowerCase();
  var filtered = allExperts.filter(function(ex) { return !q || ex.name.toLowerCase().indexOf(q) !== -1 || (ex.short_bio || "").toLowerCase().indexOf(q) !== -1; });
  filtered.forEach(function(ex) {
    var excluded = memberExclusions.has(ex.id);
    var cats = (ecoMap[ex.id] || []).map(function(c) { return '<span class="cat-tag">' + c + '</span>'; }).join("");
    var imgSrc = ex.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(ex.headshot_image) : "";
    var fallback = ex.headshot_image ? HEADSHOT_BASE + ex.headshot_image : "";
    var avatarHTML = imgSrc ? '<img src="' + imgSrc + '" onerror="this.onerror=null;this.src=\'' + fallback + '\'">' : '<div class="avatar-placeholder">' + ex.name.charAt(0) + '</div>';
    var row = document.createElement("div"); row.className = "specialist-row" + (excluded ? " excluded" : "");
    row.innerHTML = '<div class="specialist-avatar">' + avatarHTML + '</div><div class="specialist-info"><div class="specialist-name">' + ex.name + '</div><div class="specialist-tagline">' + (ex.short_bio || "") + '</div><div class="specialist-cats">' + cats + '</div></div><span class="enabled-badge ' + (excluded ? "off" : "on") + '">' + (excluded ? "Disabled" : "Enabled") + '</span>';
    row.addEventListener("click", function() {
      if (memberExclusions.has(ex.id)) memberExclusions.delete(ex.id); else memberExclusions.add(ex.id);
      checkMemberChanges(); renderMemberSpecialists(document.getElementById("mSearchInput").value);
    });
    list.appendChild(row);
  });
  document.getElementById("mEnabledCount").textContent = allExperts.length - memberExclusions.size;
  document.getElementById("mTotalCount").textContent = allExperts.length;
}

function initMemberAppearance() {
  [{ pick: "mPrimaryColor", hex: "mPrimaryHex", key: "primary_color" }, { pick: "mBgColor", hex: "mBgHex", key: "bg_color" }, { pick: "mTextColor", hex: "mTextHex", key: "text_color" }, { pick: "mCardTextColor", hex: "mCardTextHex", key: "card_text_color" }, { pick: "mAccentColor", hex: "mAccentHex", key: "accent_color" }].forEach(function(c) {
    var picker = document.getElementById(c.pick), hex = document.getElementById(c.hex);
    picker.value = memberSettings[c.key]; hex.value = memberSettings[c.key];
    picker.onchange = function() { hex.value = picker.value; memberSettings[c.key] = picker.value; updateMemberPreview(); checkMemberChanges(); };
    hex.onchange = function() { picker.value = hex.value; memberSettings[c.key] = hex.value; updateMemberPreview(); checkMemberChanges(); };
  });
  var li = document.getElementById("mLastInitial"); li.checked = memberSettings.last_initial_only;
  li.onchange = function() { memberSettings.last_initial_only = li.checked; updateMemberPreview(); checkMemberChanges(); };
  var sc = document.getElementById("mShowCount"); sc.checked = memberSettings.show_count;
  sc.onchange = function() { memberSettings.show_count = sc.checked; checkMemberChanges(); };
  var ss = document.getElementById("mShowSearch"); ss.checked = memberSettings.show_search;
  ss.onchange = function() { memberSettings.show_search = ss.checked; checkMemberChanges(); };
  document.getElementById("mModeFilter").className = "mode-btn" + (memberSettings.display_mode === "filter" ? " active" : "");
  document.getElementById("mModeGrouped").className = "mode-btn" + (memberSettings.display_mode === "grouped" ? " active" : "");
  document.getElementById("mModeFilter").onclick = function() { memberSettings.display_mode = "filter"; this.classList.add("active"); document.getElementById("mModeGrouped").classList.remove("active"); checkMemberChanges(); };
  document.getElementById("mModeGrouped").onclick = function() { memberSettings.display_mode = "grouped"; this.classList.add("active"); document.getElementById("mModeFilter").classList.remove("active"); checkMemberChanges(); };
  var fp = document.getElementById("mFontPresets"); fp.innerHTML = "";
  PRESET_FONTS.forEach(function(font) {
    var btn = document.createElement("button"); btn.className = "mode-btn" + (memberSettings.font === font ? " active" : "");
    btn.textContent = font; btn.style.fontSize = "12px";
    btn.addEventListener("click", function() { memberSettings.font = font; fp.querySelectorAll(".mode-btn").forEach(function(b) { b.classList.toggle("active", b.textContent === font); }); loadMemberFontPreview(font); checkMemberChanges(); });
    fp.appendChild(btn);
  });
  loadMemberFontPreview(memberSettings.font);
  var fsi = document.getElementById("mFontSearch"), fsr = document.getElementById("mFontResults"), fst = null;
  fsi.oninput = function() {
    var q = fsi.value.trim(); if (q.length < 2) { fsr.style.display = "none"; return; }
    clearTimeout(fst); fst = setTimeout(function() {
      fetch("https://fonts.google.com/metadata/fonts").then(function(r) { return r.text(); }).then(function(text) {
        var clean = text.replace(/^\)\]\}'?\n?/, ""); var data = JSON.parse(clean);
        var matches = data.familyMetadataList.filter(function(f) { return f.family.toLowerCase().indexOf(q.toLowerCase()) !== -1; }).slice(0, 8);
        fsr.innerHTML = ""; if (!matches.length) { fsr.style.display = "none"; return; }
        matches.forEach(function(f) {
          var item = document.createElement("div");
          item.style.cssText = "padding:10px 14px;cursor:pointer;color:#b0cce5;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.1);";
          item.textContent = f.family;
          item.onmouseenter = function() { item.style.background = "rgba(255,255,255,0.1)"; };
          item.onmouseleave = function() { item.style.background = "none"; };
          item.onclick = function() { memberSettings.font = f.family; fsi.value = ""; fsr.style.display = "none"; loadMemberFontPreview(f.family); fp.querySelectorAll(".mode-btn").forEach(function(b) { b.classList.toggle("active", b.textContent === f.family); }); checkMemberChanges(); };
          fsr.appendChild(item);
        });
        fsr.style.display = "block";
      }).catch(function() { fsr.style.display = "none"; });
    }, 300);
  };
  updateMemberPreview();
}

function loadMemberFontPreview(font) {
  var link = document.getElementById("m-font-link");
  if (!link) { link = document.createElement("link"); link.id = "m-font-link"; link.rel = "stylesheet"; document.head.appendChild(link); }
  link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(font) + ":wght@400;600;700&display=swap";
  var fp = document.getElementById("mFontPreview"); if (fp) fp.querySelector("span").style.fontFamily = "'" + font + "', serif";
}

function updateMemberPreview() {
  var s = memberSettings, card = document.getElementById("mPreviewCard");
  card.style.background = s.accent_color; card.style.border = "1px solid " + s.primary_color + "4d";
  document.getElementById("mPreviewName").style.color = s.card_text_color;
  document.getElementById("mPreviewName").style.fontFamily = "'" + s.font + "', serif";
  document.getElementById("mPreviewName").textContent = s.last_initial_only ? "Bill L." : "Bill Lloyd";
  document.getElementById("mPreviewTag").style.color = s.primary_color;
  card.parentElement.style.background = s.bg_color;
}

function checkMemberChanges() {
  var changed = JSON.stringify(memberSettings) !== JSON.stringify(originalSettings);
  if (!changed) { var a = Array.from(memberExclusions).sort(), b = Array.from(originalExclusions).sort(); changed = JSON.stringify(a) !== JSON.stringify(b); }
  document.getElementById("mUnsavedMsg").classList.toggle("visible", changed);
  var btn = document.getElementById("mSaveBtn");
  if (changed) { btn.textContent = "Save Changes"; btn.style.opacity = "1"; }
  // Update second save bar if it exists (admin side)
  var msg2 = document.getElementById("mUnsavedMsg2");
  if (msg2) msg2.classList.toggle("visible", changed);
  var btn2 = document.getElementById("mSaveBtn2");
  if (btn2 && changed) { btn2.textContent = "Save Changes"; btn2.style.opacity = "1"; }
}

function loadMemberData(member) {
  currentMember = member;
  var mn = member.member_number;
  memberSettings = { primary_color: member.primary_color || "#d4af37", bg_color: member.bg_color || "#0a1628", text_color: member.text_color || "#ffffff", card_text_color: member.card_text_color || "#ffffff", accent_color: member.accent_color || "#1a2744", last_initial_only: member.last_initial_only || false, show_count: member.show_count !== false, show_search: member.show_search !== false, display_mode: member.display_mode || "filter", font: member.font || "Playfair Display", website_enabled: member.website_enabled || false };
  originalSettings = JSON.parse(JSON.stringify(memberSettings));
  memberExclusions = new Set(allExclusionMap[mn] || []);
  originalExclusions = new Set(memberExclusions);
  renderMemberSpecialists();
  initMemberAppearance();
}

async function saveMemberSettings(statusId) {
  if (!currentMember) return;
  var btn = document.getElementById("mSaveBtn"); btn.disabled = true; btn.textContent = "Saving...";
  var btn2 = document.getElementById("mSaveBtn2"); if (btn2) { btn2.disabled = true; btn2.textContent = "Saving..."; }
  try {
    await apiCall({
      action: "save_member",
      member_number: currentMember.member_number,
      settings: { primary_color: memberSettings.primary_color, bg_color: memberSettings.bg_color, text_color: memberSettings.text_color, card_text_color: memberSettings.card_text_color, accent_color: memberSettings.accent_color, last_initial_only: memberSettings.last_initial_only, show_count: memberSettings.show_count, show_search: memberSettings.show_search, display_mode: memberSettings.display_mode, font: memberSettings.font, website_enabled: memberSettings.website_enabled },
      exclusions: Array.from(memberExclusions)
    });
    originalSettings = JSON.parse(JSON.stringify(memberSettings)); originalExclusions = new Set(memberExclusions);
    allExclusionMap[currentMember.member_number] = Array.from(memberExclusions);
    Object.assign(currentMember, memberSettings);
    document.getElementById("mUnsavedMsg").classList.remove("visible");
    var msg2 = document.getElementById("mUnsavedMsg2"); if (msg2) msg2.classList.remove("visible");
    showStatus(statusId, "success", "Settings saved!");
  } catch (err) { showStatus(statusId, "error", err.message); }
  finally {
    btn.disabled = false; btn.textContent = "Saved ✓"; btn.style.opacity = "0.6";
    if (btn2) { btn2.disabled = false; btn2.textContent = "Saved ✓"; btn2.style.opacity = "0.6"; }
  }
}

function setupMemberSearchAndBulk() {
  document.getElementById("mSearchInput").addEventListener("input", function() { renderMemberSpecialists(this.value); });
  document.getElementById("mEnableAll").addEventListener("click", function() { memberExclusions.clear(); checkMemberChanges(); renderMemberSpecialists(document.getElementById("mSearchInput").value); });
  document.getElementById("mDisableAll").addEventListener("click", function() { allExperts.forEach(function(ex) { memberExclusions.add(ex.id); }); checkMemberChanges(); renderMemberSpecialists(document.getElementById("mSearchInput").value); });
}

function setupWebsitePluginSubTabs() {
  var container = document.getElementById("memberSubTabs");
  var tabs = container.querySelectorAll(".sub-tab");
  var panels = [document.getElementById("appearanceSubPanel"), document.getElementById("pluginSubPanel")];
  tabs.forEach(function(tab) {
    tab.addEventListener("click", function() {
      tabs.forEach(function(t) { t.classList.remove("active"); });
      panels.forEach(function(p) { p.classList.remove("active"); });
      tab.classList.add("active");
      document.getElementById(tab.getAttribute("data-subpanel")).classList.add("active");
    });
  });
}

function activateSubTab(subPanelId) {
  var tabs = document.getElementById("memberSubTabs").querySelectorAll(".sub-tab");
  var panels = [document.getElementById("appearanceSubPanel"), document.getElementById("pluginSubPanel")];
  tabs.forEach(function(t) { t.classList.remove("active"); });
  panels.forEach(function(p) { p.classList.remove("active"); });
  var tab = document.getElementById("memberSubTabs").querySelector('[data-subpanel="' + subPanelId + '"]');
  if (tab) tab.classList.add("active");
  var panel = document.getElementById(subPanelId);
  if (panel) panel.classList.add("active");
}
