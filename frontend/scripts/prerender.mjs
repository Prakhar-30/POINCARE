// Runs after `vite build`. Makes the docs readable without JavaScript, for search engines and
// for AI crawlers (most of which do not run scripts):
//
//   dist/docs/index.html, dist/docs/<slug>/index.html   each docs page as static HTML, with its
//                                                       own title, description and canonical URL
//   dist/sitemap.xml                                    every public URL
//   dist/llms.txt, dist/llms-full.txt                   the docs as an index and as plain text
//
// The pages are rendered from the same React components the site ships (loaded through Vite's
// SSR loader), so the static copy cannot drift from the live one. In the browser the app mounts
// over the static HTML as usual.
//
// A failure here must never break a deploy: the site works without any of these files (the SPA
// answers every path through the vercel.json rewrite), so errors are reported and the build goes on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");
const SITE = "https://www.poincaretrade.in";

async function main() {
  const { createServer } = await import("vite");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { StaticRouter } = await import("react-router-dom/server.js");
  const { Routes, Route } = await import("react-router-dom");

  // the few browser globals the modules touch while loading and rendering
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
  try {
    const { Docs } = await vite.ssrLoadModule("/src/pages/Docs.tsx");
    const { PAGES, GROUPS } = await vite.ssrLoadModule("/src/pages/devdocs/pages.tsx");
    const { ThemeProvider } = await vite.ssrLoadModule("/src/providers/ThemeProvider.tsx");
    const template = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
    const h = React.createElement;

    const render = (url) =>
      renderToStaticMarkup(
        h(ThemeProvider, null,
          h(StaticRouter, { location: url },
            h(Routes, null,
              h(Route, { path: "/docs", element: h(Docs) }),
              h(Route, { path: "/docs/:slug", element: h(Docs) })))),
      );

    const targets = [
      { url: "/docs", file: "docs/index.html", title: "Poincaré docs", description: "Read the trend regime, quote swaps to the wei and run spread-aware DCA on Poincaré, from TypeScript, an AI agent or plain HTTP. No API keys, no oracle." },
      ...PAGES.map((p) => ({ url: `/docs/${p.slug}`, file: `docs/${p.slug}/index.html`, title: `${p.title} · Poincaré docs`, description: p.lede, page: p })),
    ];

    const full = [];
    for (const t of targets) {
      const html = render(t.url);
      const out = path.join(DIST, t.file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, withHead(template, t).replace('<div id="root"></div>', `<div id="root">${html}</div>`));
      if (t.page) full.push(`# ${t.page.title}\n\n${t.page.lede}\n\n${toText(articleOf(html))}\n\nSource: ${SITE}${t.url}`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const urls = ["/", "/docs", ...PAGES.map((p) => `/docs/${p.slug}`), "/app"];
    fs.writeFileSync(path.join(DIST, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join("\n")}\n</urlset>\n`);

    const intro = `# Poincaré\n\n> Poincaré is a Uniswap v4 hook that detects real price trends on the pool's own price with a CUSUM change detector, and charges a capped spread only to swaps pushing with a confirmed trend. Liquidity providers keep the spread. No oracle, no keeper. Live on Unichain Sepolia (testnet).\n\nThe docs below are also available as one plain-text file: ${SITE}/llms-full.txt\n`;
    const index = GROUPS.map((g) => `## ${g}\n\n${PAGES.filter((p) => p.group === g).map((p) => `- [${p.title}](${SITE}/docs/${p.slug}): ${p.lede}`).join("\n")}`).join("\n\n");
    const more = `## More\n\n- [Source code and research](https://github.com/Prakhar-30/POINCARE): contracts, tests, back-tests and security reviews\n- [App](${SITE}/app): trade, provide liquidity and watch the detector on Unichain Sepolia`;
    fs.writeFileSync(path.join(DIST, "llms.txt"), `${intro}\n${index}\n\n${more}\n`);
    fs.writeFileSync(path.join(DIST, "llms-full.txt"), `${intro}\n${full.join("\n\n---\n\n")}\n`);

    console.log(`prerender: ${targets.length} docs pages, sitemap.xml (${urls.length} urls), llms.txt, llms-full.txt`);
  } finally {
    await vite.close();
  }
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The page's own <title>, description, canonical and link-preview tags. */
function withHead(template, { url, title, description }) {
  const d = esc(description.length > 300 ? `${description.slice(0, 297)}…` : description);
  const t = esc(title);
  const canonical = `${SITE}${url}`;
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${d}$2`);
}

/** The article body: what sits between the page header and the previous / next cards. */
function articleOf(html) {
  const start = html.indexOf('<main id="doc"');
  if (start < 0) return html;
  let body = html.slice(start, html.indexOf("</main>", start));
  const h1End = body.indexOf("</h1>");
  if (h1End > 0) body = body.slice(h1End + 5);
  const pager = body.indexOf('<nav aria-label="Pagination"');
  return pager > 0 ? body.slice(0, pager) : body;
}

/** Rendered HTML to Markdown-ish plain text: headings, lists, tables, links and code survive. */
function toText(html) {
  const abs = (href) => (href.startsWith("/") ? SITE + href : href);
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<button[\s\S]*?<\/button>/g, "")
    .replace(/<span class="sr-only"[\s\S]*?<\/span>/g, "")
    .replace(/<p class="[^"]*lx-sub[^"]*"[^>]*>[\s\S]*?<\/p>/, "") // the lede, already printed above
    .replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/g, (_, c) => `\n\n\`\`\`\n${c}\n\`\`\`\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, "\n\n## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, "\n\n### $1\n\n")
    .replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/g, "\n\n_Figure: $1_\n\n")
    .replace(/<a [^>]*>(?:(?!<\/a>)[\s\S])*Edit on GitHub(?:(?!<\/a>)[\s\S])*<\/a>/g, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, text) => `[${text.replace(/<[^>]+>/g, "").trim()}](${abs(href)})`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, "`$1`")
    .replace(/<\/t[hd]>\s*<t[hd][^>]*>/g, " | ")
    .replace(/<\/tr>/g, "\n")
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<\/(p|div|li|ul|ol|table|thead|tbody|figure|section)>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

main().catch((e) => {
  console.warn("prerender skipped (the site still works without it):", e?.stack || e);
});
