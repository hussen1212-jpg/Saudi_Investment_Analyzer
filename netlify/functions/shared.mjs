import { STOCKS } from "./stocks.mjs";

const TIME_ZONE = "Asia/Riyadh";

export function jsonResponse(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

export function getKsaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function getKsaTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
}

export function shouldRefreshAfterFiveKSA(payload) {
  return true;
}

export async function fetchYahooPrice(yahooSymbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;

    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 SaudiInvestmentAnalyzer/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo response ${response.status}`);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;

    const price =
      meta?.regularMarketPrice ??
      meta?.previousClose ??
      meta?.chartPreviousClose;

    if (!price || Number.isNaN(Number(price))) {
      throw new Error("Invalid price");
    }

    return {
      price: Number(price),
      currency: meta?.currency || "SAR",
      marketTime: meta?.regularMarketTime
        ? getKsaTimestamp(new Date(meta.regularMarketTime * 1000))
        : getKsaTimestamp(),
      source: "Yahoo Finance",
      sourceNote: "تم تحديث السعر من Yahoo Finance عبر Netlify Function. تحقق رسميًا من تداول السعودية."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function updateAllPrices() {
  const prices = {};
  const errors = {};

  for (const stock of STOCKS) {
    try {
      const data = await fetchYahooPrice(stock.yahooSymbol);

      prices[stock.tadawulSymbol] = {
        ...stock,
        ...data
      };
    } catch (error) {
      errors[stock.tadawulSymbol] = {
        ...stock,
        error: String(error?.message || error)
      };
    }
  }

  return {
    status: "محدث من الخادم عند الطلب، والجدولة اليومية مفعلة الساعة 5 مساءً بتوقيت السعودية",
    lastUpdatedKSA: getKsaTimestamp(),
    ksaDateKey: getKsaDateKey(),
    source: "Yahoo Finance via Netlify Function",
    officialVerificationNote: "تداول السعودية هو المرجع الرسمي للتحقق من الأسعار والبيانات.",
    prices,
    errors
  };
}

export async function getStoredPrices() {
  return null;
}
