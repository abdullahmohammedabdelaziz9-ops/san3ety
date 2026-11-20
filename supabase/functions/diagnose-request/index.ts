const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const allowedCategories = new Set(["plumbing", "electrical", "carpentry", "air-conditioning", "painting", "cleaning"]);
const categoryNames: Record<string, string> = {
  plumbing: "سباكة", electrical: "كهرباء", carpentry: "نجارة",
  "air-conditioning": "تكييف", painting: "دهانات وتشطيبات", cleaning: "تنظيف وصيانة"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function serviceSecret(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  try {
    const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return secrets.default || "";
  } catch {
    return "";
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}

function shortText(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseModelJson(raw: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(" ```json", "").replace("```json", "").replaceAll("```", "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid model response");
  return parsed as Record<string, unknown>;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);

  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
    const serviceKey = serviceSecret();
    const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
    if (!supabaseUrl || !serviceKey || !geminiKey) {
      return jsonResponse({ error: "الخدمة غير مكتملة الإعداد. راجع أسرار Supabase وGemini." }, 503);
    }

    const rawBody = await request.text();
    if (rawBody.length > 9_500_000) return jsonResponse({ error: "الطلب كبير جدًا. قلّل حجم الصورة وحاول مرة أخرى." }, 413);
    const input = JSON.parse(rawBody);
    const text = shortText(input.text, 1500);
    const city = shortText(input.city, 100);
    const area = shortText(input.area, 120);
    const imageBase64 = typeof input.imageBase64 === "string" ? input.imageBase64 : "";
    const mimeType = shortText(input.mimeType, 40);

    if (!text && !imageBase64) return jsonResponse({ error: "اكتب وصفًا أو أرفق صورة للمشكلة." }, 400);
    if (!city || !area) return jsonResponse({ error: "المدينة والمنطقة مطلوبتان لترشيح الصنايعية." }, 400);
    if (imageBase64 && (!["image/jpeg", "image/png", "image/webp"].includes(mimeType) || imageBase64.length > 8_500_000)) {
      return jsonResponse({ error: "نوع الصورة غير مدعوم أو حجمها أكبر من المسموح." }, 400);
    }

    const ip = request.headers.get("cf-connecting-ip") ||
      (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const fingerprint = await sha256(ip + "|" + (request.headers.get("user-agent") || "san3ty"));
    const quota = await fetch(supabaseUrl + "/rest/v1/rpc/consume_ai_diagnosis_quota", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": "Bearer " + serviceKey },
      body: JSON.stringify({ p_fingerprint_hash: fingerprint, p_limit: 12 })
    });
    if (!quota.ok) {
      console.error("AI quota check failed:", quota.status);
      return jsonResponse({ error: "تعذر التحقق من حد الاستخدام. حاول لاحقًا." }, 503);
    }
    if (await quota.json() !== true) return jsonResponse({ error: "وصلت للحد المؤقت لطلبات المساعد من نفس الاتصال. جرّب بعد ساعة." }, 429);

    const prompt = [
      "أنت مساعد فرز أولي لمشكلات المنازل في مصر. حلل الصورة والوصف إن وجد، وتحدث بعربية مصرية واضحة ومختصرة.",
      "لا تجزم بسبب لا يمكن رؤيته. اذكر الاحتمالات فقط، ولا تخترع أسعارًا أو أسماء فنيين.",
      "لا تقدم تعليمات لإصلاح الكهرباء أو الغاز أو الأجهزة الخطرة. عند وجود شرر أو رائحة غاز أو دخان أو خطر انهيار، اجعل urgency emergency ووجّه المستخدم للابتعاد والاتصال بالطوارئ أو الجهة المختصة.",
      "أعد JSON فقط بالمفاتيح: category_slug, problem_title, problem_summary, likely_causes, recommended_next_step, safe_actions, urgency, safety_warning, confidence, needs_more_info.",
      "category_slug يجب أن يكون plumbing أو electrical أو carpentry أو air-conditioning أو painting أو cleaning. إذا لم تستطع تحديد التخصص اتركه فارغًا.",
      "urgency واحدة من low أو medium أو high أو emergency. confidence رقم بين 0 و1. likely_causes وsafe_actions مصفوفتان من جمل قصيرة.",
      "لا تقدر التكلفة رقميًا؛ السعر النهائي يحتاج معاينة واتفاقًا واضحًا.",
      "وصف العميل: " + (text || "لم يكتب وصفًا إضافيًا."),
      "مدينة العميل: " + city + "، المنطقة: " + area
    ].join("\n");

    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    if (imageBase64) parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });

    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(geminiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 900 }
        })
      }
    );
    const aiPayload = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      console.error("Gemini failed:", aiResponse.status);
      return jsonResponse({ error: aiResponse.status === 429 ? "وصلنا للحد المجاني المؤقت للموديل. جرّب لاحقًا." : "تعذر تحليل المشكلة. راجع إعداد Gemini API وحاول مرة أخرى." }, 502);
    }
    const modelText = aiPayload?.candidates?.[0]?.content?.parts?.map((part: {text?: string}) => part.text || "").join("") || "";
    let diagnosis: Record<string, unknown>;
    try { diagnosis = parseModelJson(modelText); }
    catch { return jsonResponse({ error: "المساعد لم يرجع تحليلًا مفهومًا. جرّب صورة أخرى أو وصفًا أوضح." }, 502); }

    const slug = allowedCategories.has(String(diagnosis.category_slug || "")) ? String(diagnosis.category_slug) : "";
    diagnosis.category_slug = slug;
    diagnosis.problem_title = shortText(diagnosis.problem_title, 180) || "مشكلة منزلية تحتاج فحصًا";
    diagnosis.problem_summary = shortText(diagnosis.problem_summary, 900) || "المشكلة تحتاج معاينة فنية.";
    diagnosis.recommended_next_step = shortText(diagnosis.recommended_next_step, 500);
    diagnosis.safety_warning = shortText(diagnosis.safety_warning, 500);
    diagnosis.likely_causes = Array.isArray(diagnosis.likely_causes) ? diagnosis.likely_causes.slice(0,4).map((v: unknown) => shortText(v,180)) : [];
    diagnosis.safe_actions = Array.isArray(diagnosis.safe_actions) ? diagnosis.safe_actions.slice(0,4).map((v: unknown) => shortText(v,180)) : [];

    let artisans: unknown[] = [];
    if (slug) {
      const match = await fetch(supabaseUrl + "/rest/v1/rpc/discover_artisans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": "Bearer " + serviceKey },
        body: JSON.stringify({ p_category_slug: slug, p_city: city, p_area: area, p_limit: 8 })
      });
      if (!match.ok) {
        console.error("Artisan discovery failed:", match.status);
        return jsonResponse({ error: "تم تحليل المشكلة، لكن تعذر جلب قائمة الصنايعية. راجع قاعدة البيانات." }, 503);
      }
      artisans = await match.json();
    }

    return jsonResponse({
      diagnosis,
      category_slug: slug,
      category_name: categoryNames[slug] || "تخصص يحتاج معاينة",
      artisans,
      artisans_source: "verified_san3ty_database",
      note: "التحليل إرشادي أولي، والترشيحات من الصنايعية الموثقين والمتاحين والمسجلين في قاعدة SAN3TY."
    });
  } catch (error) {
    console.error("diagnose-request failed:", error);
    return jsonResponse({ error: "حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل." }, 500);
  }
});
