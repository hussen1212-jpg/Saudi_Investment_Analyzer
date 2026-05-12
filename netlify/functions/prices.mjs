import {
  jsonResponse,
  getStoredPrices,
  updateAllPrices,
  shouldRefreshAfterFiveKSA
} from "./shared.mjs";

export const handler = async (event) => {
  try {
    const forceRefresh = event.queryStringParameters?.refresh === "1";

    let payload = await getStoredPrices();

    if (forceRefresh || !payload || shouldRefreshAfterFiveKSA(payload)) {
      payload = await updateAllPrices();
    }

    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({
      status: "error",
      message: "تعذر قراءة أو تحديث الأسعار من الخادم.",
      error: String(error?.message || error)
    }, 500);
  }
};
