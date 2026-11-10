export type SearchResult = {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
};

const SEARCH_TIMEOUT_MS = 8_000;

export async function webSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");
  const normalized = query.trim().slice(0, 300);
  if (!normalized) throw new Error("Search query cannot be empty");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query: normalized,
        search_depth: "basic",
        topic: "general",
        max_results: 5,
        include_answer: false,
        include_raw_content: false
      })
    });
    if (!response.ok) {
      throw new Error(`Web search provider returned ${response.status}`);
    }
    const data = await response.json() as {
      results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
    };
    return (data.results ?? [])
      .filter((item) => typeof item.url === "string" && item.url.startsWith("http"))
      .slice(0, 5)
      .map((item) => ({
        title: (item.title ?? "Untitled source").slice(0, 240),
        url: item.url!,
        content: (item.content ?? "").slice(0, 1_500),
        ...(item.published_date ? { publishedDate: item.published_date } : {})
      }));
  } finally {
    clearTimeout(timer);
  }
}
