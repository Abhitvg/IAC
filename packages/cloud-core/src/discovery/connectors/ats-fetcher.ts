export interface AtsHttpResponse {
  status: number;
  text: string;
  data?: any;
}

export type AtsHttpFetcher = (url: string) => Promise<AtsHttpResponse>;

export const defaultAtsFetcher: AtsHttpFetcher = async (url: string): Promise<AtsHttpResponse> => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS requests are permitted for ATS discovery');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; CareerOps/2.0; +https://careerops.org/bot)',
        accept: 'application/json, text/html;q=0.9',
      },
    });

    const text = await res.text();
    let data: any = undefined;
    try {
      data = JSON.parse(text);
    } catch {
      // Body is HTML or plaintext
    }

    return {
      status: res.status,
      text,
      data,
    };
  } finally {
    clearTimeout(timeout);
  }
};
