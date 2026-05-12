import { updateAllPrices, jsonResponse } from "./shared.mjs";

export default async () => {
  try {
    const payload = await updateAllPrices();

    return jsonResponse({
      ok: true,
      message: "تم تحديث أسعار الأسهم السعودية.",
      lastUpdatedKSA: payload.lastUpdatedKSA,
      updatedCount: Object.keys(payload.prices || {}).length,
      failedCount: Object.keys(payload.errors || {}).length
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: "فشل تحديث الأسعار.",
      error: String(error?.message || error)
    }, 500);
  }
};

export const config = {
  schedule: "0 14 * * *"
};
