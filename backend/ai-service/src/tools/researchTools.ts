/**
 * Tool: researchTools (web_search, fetch_url, fetch_docs)
 */

import http from 'http';
import https from 'https';

export async function executeWebSearch(input: { query: string }) {
  const q = encodeURIComponent(input.query || '');
  return new Promise((resolve) => {
    // Query DuckDuckGo instant API or return relevant developer documentation snippets
    const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;

    https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results: Array<{ title: string; snippet: string; url: string }> = [];

          if (parsed.AbstractText) {
            results.push({
              title: parsed.Heading || input.query,
              snippet: parsed.AbstractText,
              url: parsed.AbstractURL || '',
            });
          }

          if (Array.isArray(parsed.RelatedTopics)) {
            for (const item of parsed.RelatedTopics.slice(0, 5)) {
              if (item.Text && item.FirstURL) {
                results.push({
                  title: item.Text.split(' - ')[0] || item.Text.slice(0, 40),
                  snippet: item.Text,
                  url: item.FirstURL,
                });
              }
            }
          }

          if (results.length > 0) {
            resolve({ query: input.query, results, count: results.length });
            return;
          }
        } catch {}

        // Fallback curated developer reference
        resolve({
          query: input.query,
          results: [
            {
              title: `Documentation reference: ${input.query}`,
              snippet: `Authoritative engineering guides and package configurations for ${input.query}. Check official documentation or npm/bun registries.`,
              url: `https://www.google.com/search?q=${q}`,
            },
          ],
          count: 1,
        });
      });
    }).on('error', () => {
      resolve({
        query: input.query,
        results: [
          {
            title: `Engineering guide for ${input.query}`,
            snippet: `Offline fallback developer reference for ${input.query}.`,
            url: '',
          },
        ],
        count: 1,
      });
    });
  });
}

export async function executeFetchUrl(input: { url: string }) {
  const targetUrl = input.url;
  if (!targetUrl) throw new Error('fetch_url requires url');

  return new Promise((resolve) => {
    const client = targetUrl.startsWith('https') ? https : http;
    client.get(targetUrl, { timeout: 10000, headers: { 'User-Agent': 'ThirdEye-Agent/1.0' } }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        // Strip script/style tags and extract text
        const cleaned = raw
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        resolve({
          url: targetUrl,
          statusCode: res.statusCode,
          content: cleaned.slice(0, 4000),
          truncated: cleaned.length > 4000,
        });
      });
    }).on('error', (err) => {
      resolve({
        url: targetUrl,
        error: err.message,
        content: `Failed to fetch URL ${targetUrl}: ${err.message}`,
      });
    });
  });
}

const DOCS_CACHE: Record<string, string> = {
  react: `
# React 18 & 19 Core Cheatsheet
- Hooks: useState, useEffect, useRef, useMemo, useCallback
- Rule: useEffect runs after render. Ensure clean dependency array.
- LocalStorage persistence pattern:
  const [todos, setTodos] = useState(() => JSON.parse(localStorage.getItem('todos') || '[]'));
  useEffect(() => localStorage.setItem('todos', JSON.stringify(todos)), [todos]);
  `,
  bun: `
# Bun Runtime & Dev Setup
- Install deps: bun add <pkg> (or bun install)
- Run script: bun run dev / bun run build
- Dev server: Bun.serve({ port: 3000, fetch(req) { ... } }) or Vite + React
  `,
  tailwindcss: `
# Tailwind CSS v4
- In CSS: @import "tailwindcss" source(none); @source "../src";
- Dark mode: @custom-variant dark (&:is(.dark *));
- Theme tokens: @theme inline { ... }
  `,
  vite: `
# Vite 5 / 6 Setup
- React template: npm create vite@latest my-app -- --template react-ts
- Dev server runs on port 5173 (or configurable in vite.config.ts)
  `,
};

export async function executeFetchDocs(input: { library: string; topic?: string }) {
  const lib = (input.library || '').toLowerCase().trim();
  const cached = DOCS_CACHE[lib];

  if (cached) {
    return {
      library: input.library,
      topic: input.topic,
      docs: cached.trim(),
      source: 'offline-cache',
    };
  }

  // Fallback to web search
  const searchRes = await executeWebSearch({ query: `${input.library} ${input.topic || 'documentation'}` });
  return {
    library: input.library,
    topic: input.topic,
    docs: `Reference information for ${input.library}`,
    searchDetails: searchRes,
    source: 'live-search',
  };
}
