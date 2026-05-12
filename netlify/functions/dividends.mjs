import { STOCKS } from "./stocks.mjs";
import { MANUAL_DIVIDEND_DATA } from "./dividend-data.mjs";

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

function getKsaTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
}

function getCurrentYear() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric"
  }).formatToParts(new Date());

  const yearPart = parts.find(part => part.type === "year");
  return Number(yearPart?.value || new Date().getFullYear());
}

function getLast4CompletedYears() {
  const last = getCurrentYear() - 1;
  return [last - 3, last - 2, last - 1, last];
}

function round4(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

async function fetchYahooDividendEvents(yahooSymbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=10y&interval=1mo&events=div`;

    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 SaudiInvestmentAnalyzer/2.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo dividend response ${response.status}`);
    }

    const data = await response.json();
    const events = data?.chart?.result?.[0]?.events?.dividends || {};
    const dividends = Object.values(events);

    return dividends.map(item => ({
      date: new Date(Number(item.date) * 1000),
      amount: Number(item.amount || 0)
    })).filter(item => Number.isFinite(item.amount));
  } finally {
    clearTimeout(timeout);
  }
}

function aggregateDividendsByYear(dividendEvents) {
  const byYear = {};

  for (const event of dividendEvents) {
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric"
    }).format(event.date);

    byYear[year] = round4((byYear[year] || 0) + event.amount);
  }

  return byYear;
}

function buildMergedDividendRecord(stock, yahooByYear, yahooError = null) {
  const manual = MANUAL_DIVIDEND_DATA[stock.tadawulSymbol] || {};
  const years = getLast4CompletedYears();
  const currentYear = String(getCurrentYear());

  const mergedByYear = {};
  let yahooUsedCount = 0;
  let fallbackUsedCount = 0;

  for (const year of years) {
    const key = String(year);

    if (yahooByYear && yahooByYear[key] !== undefined && yahooByYear[key] !== null) {
      mergedByYear[key] = round4(yahooByYear[key]);
      yahooUsedCount++;
    } else if (manual.dividendsByYear && manual.dividendsByYear[key] !== undefined && manual.dividendsByYear[key] !== null) {
      mergedByYear[key] = round4(manual.dividendsByYear[key]);
      fallbackUsedCount++;
    } else {
      mergedByYear[key] = null;
    }
  }

  const currentYearDividendToDate =
    yahooByYear && yahooByYear[currentYear] !== undefined
      ? round4(yahooByYear[currentYear])
      : round4(manual.currentYearDividendToDate || 0);

  return {
    companyName: stock.companyName,
    tadawulSymbol: stock.tadawulSymbol,
    yahooSymbol: stock.yahooSymbol,
    dividendsByYear: mergedByYear,
    currentYearDividendToDate,
    expectedDividendPerShare: manual.expectedDividendPerShare ?? currentYearDividendToDate,
    dividendFrequency: manual.dividendFrequency || "غير متوفر",
    source: yahooUsedCount > 0 ? "Yahoo Finance dividends + manual fallback" : "Manual fallback dividend data",
    sourceStatus: yahooUsedCount > 0 ? "yahoo_with_fallback" : "fallback_only",
    yahooUsedYears: yahooUsedCount,
    fallbackUsedYears: fallbackUsedCount,
    yahooError,
    dataQualityNote: "بيانات التوزيعات تحاول القراءة من Yahoo Finance، ومع أي نقص يتم استخدام بيانات احتياطية داخلية. تحقق من تداول السعودية وإعلانات الشركة قبل القرار."
  };
}

export const handler = async () => {
  const dividends = {};
  const errors = {};

  for (const stock of STOCKS) {
    try {
      const events = await fetchYahooDividendEvents(stock.yahooSymbol);
      const yahooByYear = aggregateDividendsByYear(events);
      dividends[stock.tadawulSymbol] = buildMergedDividendRecord(stock, yahooByYear, null);
    } catch (error) {
      errors[stock.tadawulSymbol] = String(error?.message || error);
      dividends[stock.tadawulSymbol] = buildMergedDividendRecord(stock, null, String(error?.message || error));
    }
  }

  return jsonResponse({
    status: "تحديث توزيعات مستوى 2: محاولة تلقائية من Yahoo Finance مع بيانات احتياطية عند النقص.",
    lastUpdatedKSA: getKsaTimestamp(),
    currentYear: getCurrentYear(),
    last4CompletedYears: getLast4CompletedYears(),
    source: "Yahoo Finance dividends + manual fallback",
    officialVerificationNote: "تداول السعودية وإعلانات الشركة هي المرجع الرسمي النهائي للتوزيعات.",
    dividends,
    errors
  });
};
