export const DAILY_INDEX_DAYS: number;
export const INDEX_COMPARE_PAGES: boolean;
export function dailyIsFresh(urlSlug: string, now?: number): boolean;
export const NEWS_TAKE_INDEX_DAYS: number;
export function newsTakeIsFresh(publishedAt: string | Date, now?: number): boolean;
