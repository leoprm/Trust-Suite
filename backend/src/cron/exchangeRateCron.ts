/**
 * Exchange Rate Cron — cada 6 horas obtiene USD/CLP desde exchangerate-api.com.
 *
 * GET https://api.exchangerate-api.com/v4/latest/USD
 * Extrae rates.CLP y hace upsert en ExchangeRate con id="USD_CLP".
 */

import { PrismaClient } from "@prisma/client";

export interface ExchangeRateResult {
  rate: number;
  updated: boolean;
}

/**
 * Ejecuta una ronda de actualización del tipo de cambio USD→CLP.
 * Hace upsert sobre el registro singleton ExchangeRate(id="USD_CLP").
 */
export async function runExchangeRateUpdate(
  prisma: PrismaClient,
): Promise<ExchangeRateResult> {
  console.log("[ExchangeRate] 🔄 Obteniendo tipo de cambio USD/CLP…");

  const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
  if (!res.ok) {
    throw new Error(
      `[ExchangeRate] ❌ API responded with ${res.status}: ${res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    rates: { CLP: number };
    date: string;
  };

  const rate = data.rates.CLP;
  if (!rate || typeof rate !== "number") {
    throw new Error(
      `[ExchangeRate] ❌ No se pudo extraer rates.CLP de la respuesta`,
    );
  }

  await prisma.exchangeRate.upsert({
    where: { id: "USD_CLP" },
    create: { id: "USD_CLP", rate },
    update: { rate },
  });

  console.log(
    `[ExchangeRate] ✅ USD/CLP = ${rate} (fetch date: ${data.date})`,
  );

  return { rate, updated: true };
}
