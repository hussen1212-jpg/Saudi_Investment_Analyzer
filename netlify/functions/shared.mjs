import { getStore } from "@netlify/blobs";
import { STOCKS } from "./stocks.mjs";

const STORE_NAME = "saudi-investment-analyzer";
const PRICE_KEY = "latest-prices";
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
  const now = new Date();

  const hourKsa = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      hour12: false
    }).format(now)
  );

  const todayKsa = getKsaDateKey(now);

  return hourKsa >= 17 && (!payload || payload.ksaDateKey !== todayKsa);
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

  const payload = {
    status: "محدث يوميًا الساعة 5 مساءً بتوقيت السعودية",
    lastUpdatedKSA: getKsaTimestamp(),
    ksaDateKey: getKsaDateKey(),
    source: "Yahoo Finance via Netlify Scheduled Function",
    officialVerificationNote: "تداول السعودية هو المرجع الرسمي للتحقق من الأسعار والبيانات.",
    prices,
    errors
  };

  const store = getStore(STORE_NAME);
  await store.setJSON(PRICE_KEY, payload);

  return payload;
}

export async function getStoredPrices() {
  const store = getStore(STORE_NAME);
  return await store.get(PRICE_KEY, { type: "json" });
}
