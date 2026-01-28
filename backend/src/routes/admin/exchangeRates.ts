import { Router, Request, Response, NextFunction } from 'express';
import {
  getExchangeRate,
  convertToEur,
  getAllCachedRates,
  clearCachedRates,
  refreshRate,
  SUPPORTED_CURRENCIES,
} from '../../services/exchangeRate/index.js';

const router = Router();

// Wrap async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * GET /api/admin/exchange-rates
 * Get all cached exchange rates
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const rates = await getAllCachedRates();
  res.json({
    rates,
    supportedCurrencies: SUPPORTED_CURRENCIES,
  });
}));

/**
 * GET /api/admin/exchange-rates/lookup
 * Look up exchange rate for a specific currency and date
 * Query params: currency, year, month
 */
router.get('/lookup', asyncHandler(async (req: Request, res: Response) => {
  const { currency, year, month } = req.query;

  if (!currency) {
    res.status(400).json({ error: 'Currency is required' });
    return;
  }

  const yearNum = year ? parseInt(year as string, 10) : new Date().getFullYear();
  const monthNum = month ? parseInt(month as string, 10) : new Date().getMonth() + 1;

  const date = new Date(yearNum, monthNum - 1, 15);
  const rate = await getExchangeRate(currency as string, date);

  res.json({
    currency: (currency as string).toUpperCase(),
    year: yearNum,
    month: monthNum,
    rateToEur: rate,
  });
}));

/**
 * POST /api/admin/exchange-rates/convert
 * Convert amount from a currency to EUR
 * Body: { amount, currency, purchaseDate }
 */
router.post('/convert', asyncHandler(async (req: Request, res: Response) => {
  const { amount, currency, purchaseDate } = req.body;

  if (typeof amount !== 'number' || !currency) {
    res.status(400).json({ error: 'Amount and currency are required' });
    return;
  }

  const date = purchaseDate ? new Date(purchaseDate) : new Date();
  const eurAmount = await convertToEur(amount, currency, date);
  const rate = await getExchangeRate(currency, date);

  res.json({
    originalAmount: amount,
    originalCurrency: currency.toUpperCase(),
    eurAmount,
    rate: rate,
    purchaseDate: date.toISOString(),
  });
}));

/**
 * DELETE /api/admin/exchange-rates/clear
 * Clear cached exchange rates
 * Query params: currency (optional), year (optional), month (optional)
 */
router.delete('/clear', asyncHandler(async (req: Request, res: Response) => {
  const { currency, year, month } = req.query;

  const yearNum = year ? parseInt(year as string, 10) : undefined;
  const monthNum = month ? parseInt(month as string, 10) : undefined;

  const deletedCount = await clearCachedRates(
    currency as string | undefined,
    yearNum,
    monthNum
  );

  res.json({
    success: true,
    deletedCount,
    message: `Cleared ${deletedCount} cached exchange rate(s)`,
  });
}));

/**
 * POST /api/admin/exchange-rates/refresh
 * Force refresh a rate from InforEuro API
 * Body: { currency, year, month }
 */
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { currency, year, month } = req.body;

  if (!currency) {
    res.status(400).json({ error: 'Currency is required' });
    return;
  }

  const yearNum = year || new Date().getFullYear();
  const monthNum = month || new Date().getMonth() + 1;

  const date = new Date(yearNum, monthNum - 1, 15);
  const rate = await refreshRate(currency, date);

  res.json({
    currency: currency.toUpperCase(),
    year: yearNum,
    month: monthNum,
    rateToEur: rate,
    message: `Refreshed rate for ${currency} ${monthNum}/${yearNum}`,
  });
}));

export default router;
