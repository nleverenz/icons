import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "../(api)/lib";

export const metadata: Metadata = {
  title: "API Reference | AAC Library",
  description:
    "A free, zero-auth REST API for searching and downloading symbols from this AAC library, with keywords, descriptions, and direct image URLs.",
  alternates: { canonical: "/docs" },
};

type Param = { name: string; type: string; required?: boolean; desc: string };

function ParamTable({ params }: { params: Param[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Parameter</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-t">
              <td className="px-4 py-2 align-top font-mono text-xs">
                {p.name}
                {p.required && <span className="ml-1 text-[10px] text-amber-600">required</span>}
              </td>
              <td className="px-4 py-2 align-top font-mono text-xs text-muted-foreground">
                {p.type}
              </td>
              <td className="px-4 py-2 align-top text-muted-foreground">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Method({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-sm">
      <span className="rounded bg-emerald-600/10 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        GET
      </span>
      <span>{path}</span>
    </div>
  );
}

export default function DocsPage() {
  const base = SITE_URL;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="mb-8 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          ← Back to Icons
        </Link>
      </nav>

      <h1 className="text-3xl font-bold">API Reference</h1>
      <p className="mt-3 text-base text-muted-foreground">
        A free, zero-auth REST API over this AAC symbol catalog, enriched with keywords and
        category tags. No API key required, CORS is open to all origins, and responses are
        cached at the edge.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted-foreground">Base URL</h2>
        <Code>{base}</Code>
      </section>

      {/* ---------------- Search ---------------- */}
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold">Search icons</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ranked keyword search over icon names and tags (prefix + fuzzy matching). Returns one
          result per logical icon, with its variants grouped. This is the recommended endpoint for
          building search UIs.
        </p>
        <div className="mt-4">
          <Method path="/api/search" />
        </div>
        <ParamTable
          params={[
            { name: "q", type: "string", desc: "Search query (matches name + tags). Alias: name." },
            { name: "vendor", type: "string", desc: 'Restrict to one set, e.g. "aac".' },
            { name: "limit", type: "number", desc: "Page size. Default 100, max 500." },
            { name: "offset", type: "number", desc: "Pagination offset. Default 0." },
          ]}
        />
        <Code>{`curl "${base}/api/search?q=muffin&limit=2"`}</Code>
        <Code>{`{
  "total": 1,
  "count": 1,
  "limit": 2,
  "offset": 0,
  "items": [
    {
      "id": "aac/Mini Muffin Match Up",
      "vendor": "aac",
      "name": "Mini Muffin Match Up",
      "description": "",
      "tags": ["AAC", "Play", "Games"],
      "download": "/icons/library/AAC/Play/Games/Mini Muffin Match-Up.png",
      "url": "/icons/aac/Mini Muffin Match Up",
      "variants": [
        {
          "name": "Mini Muffin Match Up",
          "properties": {},
          "download": "/icons/library/AAC/Play/Games/Mini Muffin Match-Up.png"
        }
      ]
    }
  ]
}`}</Code>
      </section>

      {/* ---------------- List ---------------- */}
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold">List icons</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Lists every icon file (each variant is a separate item). Filtering is exact substring on
          name. Use <span className="font-mono text-xs">/api/search</span> for ranked search.
        </p>
        <div className="mt-4">
          <Method path="/api" />
        </div>
        <ParamTable
          params={[
            { name: "vendor", type: "string", desc: "Restrict to one set." },
            { name: "q", type: "string", desc: "Case-insensitive substring on the icon name." },
            {
              name: "variant:<key>",
              type: "string",
              desc: "Filter by a variant property, e.g. variant:style=solid or variant:weight=bold.",
            },
          ]}
        />
        <Code>{`curl "${base}/api?vendor=aac"`}</Code>
      </section>

      {/* ---------------- Vendors ---------------- */}
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold">List sets</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Metadata for every icon set, including its variant axes and counts.
        </p>
        <div className="mt-4">
          <Method path="/api/vendors" />
        </div>
        <Code>{`{
  "total": 1,
  "items": [
    {
      "id": "aac",
      "name": "AAC",
      "version": "1",
      "count": 3,
      "variants": {}
    }
  ]
}`}</Code>
      </section>

      {/* ---------------- Assets ---------------- */}
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold">Raw image assets</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every <span className="font-mono text-xs">download</span> URL from the responses above
          points directly at the image file — safe to use as-is in an{" "}
          <span className="font-mono text-xs">&lt;img&gt;</span> tag.
        </p>
        <Code>{`<img src="${base}/library/AAC/Play/Games/bakeshop.png" width="64" height="64" alt="Bakeshop" />`}</Code>
      </section>

      {/* ---------------- Notes ---------------- */}
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold">Notes</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>No authentication. All endpoints accept GET and respond with JSON.</li>
          <li>
            CORS is open to every origin; responses set{" "}
            <span className="font-mono text-xs">s-maxage=3600, stale-while-revalidate=86400</span>.
          </li>
          <li>
            Each icon set keeps its upstream license — review the source project before
            redistribution.
          </li>
        </ul>
      </section>
    </main>
  );
}
