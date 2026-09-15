import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalog, getIcon } from "@/app/(api)/catalog";
import { buildDownloadUrl, SITE_URL } from "@/app/(api)/lib";
import { type IconDoc, previewSrc, type VendorMeta } from "@/app/(api)/search-core";

// GitHub Pages is fully static, so generate every asset page at build time.
export const dynamicParams = false;

type Params = { vendor: string; name: string };

export async function generateStaticParams(): Promise<Params[]> {
  const { icons } = await getCatalog();

  return icons.map((icon) => ({
    vendor: icon.vendor,
    name: icon.name,
  }));
}

async function resolve(params: Promise<Params>): Promise<{ icon: IconDoc; vendor: VendorMeta }> {
  const { vendor, name } = await params;
  const icon = await getIcon(vendor, decodeURIComponent(name));
  if (!icon) notFound();
  const { vendors } = await getCatalog();
  return { icon, vendor: vendors[icon.vendor] ?? { id: icon.vendor, name: icon.vendor } };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { vendor, name } = await params;
  const icon = await getIcon(vendor, decodeURIComponent(name));
  if (!icon) return { title: "Icon not found | AAC Library" };

  const { vendors } = await getCatalog();
  const vendorName = vendors[icon.vendor]?.name ?? icon.vendor;
  const title = `${icon.name} icon — ${vendorName} | AAC Library`;
  const description =
    icon.description ||
    `Download the "${icon.name}" icon from ${vendorName} as SVG. Free and open source.`;
  const canonical = `/icons/${icon.vendor}/${encodeURIComponent(icon.name)}`;
  const ogImage = buildDownloadUrl(icon.vendor, icon.file);

  return {
    title,
    description,
    keywords: icon.tags,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      siteName: "AAC Library",
      images: [{ url: ogImage, width: 512, height: 512, alt: `${icon.name} icon` }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function IconPage({ params }: { params: Promise<Params> }) {
  const { icon, vendor } = await resolve(params);
  const preview = previewSrc(icon.vendor, icon.file);
  const rawUrl = buildDownloadUrl(icon.vendor, icon.file);
  // svgl logos are full-color brand marks — never invert them like monochrome icons.
  const isSvgl = icon.vendor === "svgl";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: `${icon.name} icon`,
    description: icon.description || `The "${icon.name}" icon from ${vendor.name}.`,
    contentUrl: rawUrl,
    encodingFormat: "image/svg+xml",
    keywords: icon.tags.join(", "),
    isAccessibleForFree: true,
    license: vendor.url,
    creator: { "@type": "Organization", name: vendor.name, url: vendor.url },
    url: `${SITE_URL}/icons/${icon.vendor}/${encodeURIComponent(icon.name)}`,
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Icons
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/?vendor=${icon.vendor}`} className="hover:text-foreground">
          {vendor.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{icon.name}</span>
      </nav>

      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <div className="flex h-60 w-60 shrink-0 items-center justify-center rounded-2xl border bg-white p-5">
          <img
            src={preview}
            alt={icon.name}
            className="h-40 w-40 object-contain"
          />
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-bold">{icon.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {vendor.name}
            {vendor.version ? ` · v${vendor.version}` : ""}
          </p>

          {icon.description && <p className="mt-4 text-base">{icon.description}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={rawUrl}
              download
              className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Download
            </a>
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              View raw
            </a>
          </div>
        </div>
      </div>

      {icon.tags.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-muted-foreground">Keywords</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {icon.tags.map((tag) => (
              <Link
                key={tag}
                href={`/?q=${encodeURIComponent(tag)}`}
                className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-muted"
              >
                {tag}
              </Link>
            ))}
          </div>
        </section>
      )}

      {icon.variants.length > 1 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Variants ({icon.variants.length})
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {icon.variants.map((v) => {
              const dark = isSvgl && v.properties?.theme === "dark";
              return (
                <a
                  key={v.file}
                  href={buildDownloadUrl(icon.vendor, v.file)}
                  download
                  className={
                    dark
                      ? "flex flex-col items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-center hover:opacity-90"
                      : "flex flex-col items-center gap-2 rounded-lg border bg-card/60 p-4 text-center hover:bg-muted"
                  }
                >
                  <img
                    src={previewSrc(icon.vendor, v.file)}
                    alt={v.name}
                    className={
                      isSvgl ? "h-8 w-8 object-contain" : "h-8 w-8 object-contain dark:invert"
                    }
                  />
                  <span
                    className={
                      dark ? "text-[11px] text-neutral-400" : "text-[11px] text-muted-foreground"
                    }
                  >
                    {Object.values(v.properties).join(" · ") || v.name}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
