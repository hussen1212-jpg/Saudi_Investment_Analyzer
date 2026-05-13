import { VISION_GROWTH_DATA } from "./vision-growth-data.mjs";

function jsonResponse(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function pctUpside(target, current) {
  if (!current || Number(current) <= 0) return 0;
  return ((Number(target) / Number(current)) - 1) * 100;
}

function classByAlignment(value) {
  const text = String(value || "");
  if (text.includes("قوي")) return "green";
  if (text.includes("منخفض")) return "red";
  return "orange";
}

function classByGrowth(value) {
  const text = String(value || "");
  if (text.includes("مرتفعة")) return "green";
  if (text.includes("منخفضة")) return "red";
  return "orange";
}

function classByCatalyst(value) {
  const text = String(value || "");
  if (text.includes("قوي") || text === "إيجابي") return "green";
  if (text.includes("سلبي")) return "red";
  return "orange";
}

function buildImpression(record, fairValue, currentPrice) {
  const score = Number(record.growthScoreOutOf10 || 0);
  const alignment = String(record.vision2030Alignment || "");

  if (score >= 8 && alignment.includes("قوي")) {
    return "الشركة أو القطاع يظهر ارتباطًا قويًا برؤية 2030 مع احتمالية نمو أرباح جيدة. هذا قد يدعم تقييمًا أعلى إذا تحولت المحفزات إلى نمو فعلي في الإيرادات والأرباح.";
  }

  if (score >= 7) {
    return "الشركة لديها محفزات نمو معقولة وارتباط جيد نسبيًا ببرامج الرؤية، لكن الأثر السعري يحتاج تأكيدًا من النتائج المالية والإعلانات الرسمية.";
  }

  if (score < 6.5) {
    return "محفزات النمو محدودة أو مرتبطة بدورة قطاعية، لذلك لا يفضل رفع السعر العادل كثيرًا دون تحسن واضح في الأرباح.";
  }

  return "المحفزات متوسطة، وينبغي التعامل معها كعامل مساعد فقط بجانب السعر العادل والتوزيعات والحركة التاريخية.";
}

export const handler = async (event) => {
  try {
    const symbol = event.queryStringParameters?.symbol;
    const fairValue = Number(event.queryStringParameters?.fairValue || 0);
    const currentPrice = Number(event.queryStringParameters?.currentPrice || 0);

    if (!symbol) {
      return jsonResponse({ error: "Missing symbol. Example: /.netlify/functions/vision?symbol=1150" }, 400);
    }

    const record = VISION_GROWTH_DATA[symbol];

    if (!record) {
      return jsonResponse({
        symbol,
        vision2030Alignment: "غير متوفر",
        growthProbability: "غير متوفر",
        growthScoreOutOf10: 0,
        catalystRating: "غير متوفر",
        catalysts: [],
        risks: [],
        sourceStatus: "لا توجد بيانات داخلية لهذه الشركة",
        note: "أضف الشركة إلى ملف vision-growth-data.mjs."
      }, 404);
    }

    const impact = record.fairValueImpact || { conservative: 0, base: 0, optimistic: 0 };
    const conservative = fairValue * (1 + Number(impact.conservative || 0));
    const base = fairValue * (1 + Number(impact.base || 0));
    const optimistic = fairValue * (1 + Number(impact.optimistic || 0));

    return jsonResponse({
      symbol,
      companyName: record.companyName,
      vision2030Alignment: record.vision2030Alignment,
      alignmentClass: classByAlignment(record.vision2030Alignment),
      sectorSupport: record.sectorSupport,
      growthProbability: record.growthProbability,
      growthClass: classByGrowth(record.growthProbability),
      growthScoreOutOf10: record.growthScoreOutOf10,
      catalystRating: record.catalystRating,
      catalystClass: classByCatalyst(record.catalystRating),
      catalysts: record.catalysts || [],
      risks: record.risks || [],
      fairValueImpact: impact,
      priceScenarios: {
        conservative: { price: round2(conservative), upside: round2(pctUpside(conservative, currentPrice)) },
        base: { price: round2(base), upside: round2(pctUpside(base, currentPrice)) },
        optimistic: { price: round2(optimistic), upside: round2(pctUpside(optimistic, currentPrice)) }
      },
      impression: buildImpression(record, fairValue, currentPrice),
      sourceStatus: "بيانات تحليلية داخلية قابلة للتحديث",
      note: record.note || "هذا تقييم نوعي تعليمي، ولا يمثل توقعًا مؤكدًا للسعر. يجب التحقق من الأخبار والإعلانات الرسمية."
    });
  } catch (error) {
    return jsonResponse({
      error: "تعذر تحليل مواءمة رؤية 2030 ومحفزات النمو.",
      details: String(error?.message || error)
    }, 500);
  }
};
