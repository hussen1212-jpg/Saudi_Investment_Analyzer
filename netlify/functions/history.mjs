const TIME_ZONE = "Asia/Riyadh";

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

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = average(values.map(value => Math.pow(value - avg, 2)));
  return Math.sqrt(variance);
}

function maxDrawdown(prices) {
  let peak = prices[0] || 0;
  let maxDd = 0;

  for (const price of prices) {
    if (price > peak) peak = price;
    if (peak > 0) {
      const dd = (price / peak - 1) * 100;
      if (dd < maxDd) maxDd = dd;
    }
  }

  return maxDd;
}

function priceLocation(current, low, high) {
  if (!high || !low || high === low) return 50;
  return ((current - low) / (high - low)) * 100;
}

function pctChange(current, previous) {
  if (!previous || previous <= 0) return 0;
  return ((current / previous) - 1) * 100;
}

function findPriceNDaysAgo(points, days) {
  if (!points.length) return null;
  const target = Date.now() - days * 24 * 60 * 60 * 1000;
  let best = points[0];

  for (const point of points) {
    if (Math.abs(point.time - target) < Math.abs(best.time - target)) {
      best = point;
    }
  }

  return best.close;
}

function classifyHistory(data) {
  const {
    return3Y,
    maxDrawdown,
    annualVolatility,
    priceLocationPct,
    aboveMA200,
    return12M,
    return6M
  } = data;

  let score = 0;

  if (return3Y > 30) score += 2;
  else if (return3Y > 10) score += 1;
  else if (return3Y < -10) score -= 1;

  if (aboveMA200) score += 1;
  else score -= 1;

  if (return12M > 10) score += 1;
  else if (return12M < -10) score -= 1;

  if (return6M > 5) score += 1;
  else if (return6M < -5) score -= 1;

  if (maxDrawdown < -40) score -= 2;
  else if (maxDrawdown < -25) score -= 1;

  if (annualVolatility > 38) score -= 1;

  if (priceLocationPct > 85) score -= 1;
  else if (priceLocationPct < 35 && return6M >= 0) score += 1;

  let trendLabel = "عرضي / محايد";
  let momentumLabel = "زخم محايد";
  let impressionClass = "orange";
  let momentumClass = "orange";
  let impression = "السهم يتحرك بصورة محايدة نسبيًا، ويحتاج تأكيدًا من النتائج المالية أو كسر اتجاه واضح قبل اعتبار الحركة إيجابية.";

  if (score >= 3) {
    trendLabel = "اتجاه إيجابي";
    momentumLabel = return6M > 5 ? "زخم إيجابي" : "زخم مقبول";
    impressionClass = "green";
    momentumClass = "green";
    impression = "حركة السهم خلال آخر 3 سنوات تميل للإيجابية، مع زخم مقبول وموقع سعري غير سلبي. يظل القرار مرتبطًا بجودة الشركة والسعر العادل والتوزيعات.";
  } else if (score <= -2) {
    trendLabel = "اتجاه ضعيف";
    momentumLabel = return6M < -5 ? "زخم سلبي" : "زخم ضعيف";
    impressionClass = "red";
    momentumClass = "red";
    impression = "حركة السهم خلال آخر 3 سنوات ضعيفة أو عالية التذبذب، لذلك يلزم الحذر وعدم الاعتماد على انخفاض السعر وحده كسبب للاستثمار.";
  } else if (priceLocationPct > 85) {
    trendLabel = "قريب من القمة";
    momentumLabel = return6M > 0 ? "زخم إيجابي لكن السعر مرتفع تاريخيًا" : "زخم محايد";
    impressionClass = "orange";
    momentumClass = "orange";
    impression = "السهم قريب من قمته خلال 3 سنوات، وهذا لا يعني البيع بالضرورة، لكنه يقلل هامش الأمان إذا لم تدعم النتائج المالية هذا الارتفاع.";
  } else if (priceLocationPct < 35) {
    trendLabel = "قريب من القاع النسبي";
    momentumLabel = return6M >= 0 ? "تحسن مبدئي" : "لم يؤكد التعافي";
    impressionClass = return6M >= 0 ? "green" : "orange";
    momentumClass = return6M >= 0 ? "green" : "orange";
    impression = "السعر قريب من الجزء الأدنى من نطاقه التاريخي خلال 3 سنوات. قد يكون ذلك فرصة إذا كانت النتائج تتحسن، أو فخًا سعريًا إذا كانت الأرباح تحت ضغط.";
  }

  return { trendLabel, momentumLabel, impressionClass, momentumClass, impression };
}

async function fetchYahooHistory(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1d`;
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 SaudiInvestmentAnalyzerHistory/1.0"
      }
    });

    if (!response.ok) throw new Error(`Yahoo history response ${response.status}`);

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];

    const points = timestamps
      .map((time, index) => ({
        time: Number(time) * 1000,
        close: Number(closes[index])
      }))
      .filter(point => Number.isFinite(point.close) && point.close > 0);

    if (points.length < 30) {
      throw new Error("Insufficient historical data");
    }

    return points;
  } finally {
    clearTimeout(timeout);
  }
}

export const handler = async (event) => {
  try {
    const symbol = event.queryStringParameters?.symbol;

    if (!symbol) {
      return jsonResponse({
        error: "Missing symbol. Example: /.netlify/functions/history?symbol=1150.SR"
      }, 400);
    }

    const points = await fetchYahooHistory(symbol);
    const prices = points.map(point => point.close);
    const currentPrice = prices[prices.length - 1];
    const firstPrice = prices[0];
    const high3Y = Math.max(...prices);
    const low3Y = Math.min(...prices);

    const dailyReturns = [];
    for (let i = 1; i < prices.length; i++) {
      dailyReturns.push((prices[i] / prices[i - 1]) - 1);
    }

    const ma200 = average(prices.slice(-200));
    const return3Y = pctChange(currentPrice, firstPrice);
    const p12 = findPriceNDaysAgo(points, 365);
    const p6 = findPriceNDaysAgo(points, 182);
    const return12M = pctChange(currentPrice, p12);
    const return6M = pctChange(currentPrice, p6);
    const annualVolatility = standardDeviation(dailyReturns) * Math.sqrt(252) * 100;
    const maxDd = maxDrawdown(prices);
    const location = priceLocation(currentPrice, low3Y, high3Y);
    const aboveMA200 = currentPrice >= ma200;

    const classification = classifyHistory({
      return3Y,
      maxDrawdown: maxDd,
      annualVolatility,
      priceLocationPct: location,
      aboveMA200,
      return12M,
      return6M
    });

    return jsonResponse({
      symbol,
      source: "Yahoo Finance historical prices via Netlify Function",
      lastUpdatedKSA: new Intl.DateTimeFormat("ar-SA", {
        timeZone: TIME_ZONE,
        dateStyle: "medium",
        timeStyle: "medium"
      }).format(new Date()),
      currentPrice: round2(currentPrice),
      high3Y: round2(high3Y),
      low3Y: round2(low3Y),
      return3Y: round2(return3Y),
      return12M: round2(return12M),
      return6M: round2(return6M),
      annualVolatility: round2(annualVolatility),
      maxDrawdown: round2(maxDd),
      ma200: round2(ma200),
      aboveMA200,
      priceLocationPct: round2(location),
      trendLabel: classification.trendLabel,
      momentumLabel: classification.momentumLabel,
      impressionClass: classification.impressionClass,
      momentumClass: classification.momentumClass,
      impression: classification.impression,
      note: "هذه قراءة تاريخية تعليمية مبنية على أسعار Yahoo Finance، ولا تمثل توصية شراء أو بيع. تحقق من الرسم البياني والمصادر الرسمية قبل القرار."
    });
  } catch (error) {
    return jsonResponse({
      error: "تعذر تحليل الحركة التاريخية للسهم.",
      details: String(error?.message || error)
    }, 500);
  }
};
