// GA4 Data API v1beta — fetch sessions per pagePath per day.
// Dùng: POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport

import { getAccessToken } from './oauth';

export interface Ga4DayRow {
  date: string;      // 'YYYYMMDD' → convert sang 'YYYY-MM-DD'
  pagePath: string;
  sessions: number;
}

export async function fetchGa4Sessions(
  propertyId: string,  // numeric, VD: '362645470'
  startDate: string,   // 'YYYY-MM-DD'
  endDate: string
): Promise<Ga4DayRow[]> {
  const accessToken = await getAccessToken();
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }, { name: 'pagePath' }],
    metrics: [{ name: 'sessions' }],
    limit: 10000,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(
      `GA4 API lỗi ${res.status}: ${err.error?.message ?? res.statusText}`
    );
  }

  const data = (await res.json()) as {
    rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
  };

  return (data.rows ?? []).map((row) => {
    const rawDate = row.dimensionValues[0]?.value ?? '';
    // GA4 trả về 'YYYYMMDD' → convert sang 'YYYY-MM-DD'
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;
    return {
      date,
      pagePath: row.dimensionValues[1]?.value ?? '/',
      sessions: parseInt(row.metricValues[0]?.value ?? '0', 10),
    };
  });
}
