"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Search } from "lucide-react";
import type MiniSearch from "minisearch";
import { GridaLogo } from "@/components/grida-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  createIndex,
  type IconDoc,
  type IconVariant,
  previewSrc,
  runSearch,
  type SearchIndexFile,
  type VendorMeta,
} from "./(api)/search-core";

type Catalog = { index: MiniSearch<IconDoc>; docs: IconDoc[]; vendors: VendorMeta[] };

// Stable empty fallbacks so derived values keep a constant reference before load.
const EMPTY_DOCS: IconDoc[] = [];
const EMPTY_VENDORS: VendorMeta[] = [];

/**
 * Resolve which variant to preview for a logical icon given the active variant
 * filters. Returns null when filters are active but no variant matches (so the
 * icon is excluded), mirroring the old per-file filter behavior.
 */
function resolveVariant(
  icon: IconDoc,
  variantFilters: Record<string, string | undefined>,
): IconVariant | null {
  const active = Object.entries(variantFilters).filter(([, v]) => Boolean(v));
  if (!active.length) {
    return icon.variants.find((v) => v.file === icon.file) ?? icon.variants[0] ?? null;
  }
  return (
    icon.variants.find((v) =>
      active.every(([key, value]) => String(v.properties?.[key]) === String(value)),
    ) ?? null
  );
}

/** svgl "dark" logos are light-colored and need a dark tile to be visible. */
function isDarkLogo(vendor: string, variant: IconVariant): boolean {
  return vendor === "svgl" && variant.properties?.theme === "dark";
}

function TaxonomyTree({
  tree,
  docs,
  path = ["AAC"],
  depth = 0,
  activePath,
  onSelectPath,
}: {
  tree: Record<string, unknown>;
  docs: { vendor: string; tags?: string[] }[];
  path?: string[];
  depth?: number;
  activePath?: string[];
  onSelectPath: (path: string[]) => void;
}) {
  return (
    <>
      {Object.entries(tree).map(([name, children]) => {
        const folderPath = [...path, name];
        const count = docs.filter(
          (doc) =>
            doc.vendor === "aac" &&
            folderPath.every((part, i) => doc.tags?.[i] === part),
        ).length;

        return (
        <div key={`${depth}-${name}`}>
          <button
            type="button"
            onClick={() => onSelectPath(folderPath)}
            className={`flex w-full items-center rounded-md py-1.5 text-sm hover:bg-sidebar-accent ${
              activePath?.join("/") === folderPath.join("/")
                ? "bg-sidebar-accent font-medium"
                : ""
            }`}
            style={{ paddingLeft: `${16 + depth * 16}px` }}
          >
            <span>{name}</span>
            <span className="ml-auto pr-2 text-xs text-muted-foreground">
              {count}
            </span>
          </button>

          {children &&
            typeof children === "object" &&
            Object.keys(children as Record<string, unknown>).length > 0 && (
              <TaxonomyTree
                tree={children as Record<string, unknown>}
                docs={docs}
                path={folderPath}
                depth={depth + 1}
                activePath={activePath}
                onSelectPath={onSelectPath}
              />
            )}
        </div>
        );
      })}
    </>
  );
}

function AppSidebar({
  vendors,
  docs,
  active,
  onSelect,
  activePath,
  onSelectPath,
}: {
  docs: { vendor: string; tags?: string[] }[];
  vendors: {
    id: string;
    name?: string;
    count: number;
    taxonomy?: Record<string, unknown>;
  }[];
  active?: string;
  onSelect?: (id: string | undefined) => void;
}) {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold">Library</span>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Archive</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={!active} onClick={() => onSelect?.(undefined)}>
                  <span>All</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {vendors.map((set) => (
                <SidebarMenuItem key={set.id}>
                  <SidebarMenuButton
                    isActive={active === set.id}
                    onClick={() => onSelect?.(set.id)}
                  >
                    <span>{set.id === "aac" ? "AAC" : (set.name ?? set.id)}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{set.count}</span>
                  </SidebarMenuButton>
                  {active === set.id &&
                    set.taxonomy &&
                    Object.keys(set.taxonomy).length > 0 && (
                      <TaxonomyTree
                        docs={docs}
                        activePath={activePath}
                        onSelectPath={onSelectPath}
                        tree={
                          set.taxonomy.AAC &&
                          typeof set.taxonomy.AAC === "object"
                            ? (set.taxonomy.AAC as Record<string, unknown>)
                            : set.taxonomy
                        }
                      />
                    )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

    </Sidebar>
  );
}

// URL is the source of truth for `q` and `vendor` (via nuqs) so views are
// shareable and browser back/forward navigates between them. Typing updates `q`
// optimistically while the URL write is throttled (replace = no history spam);
// selecting a set pushes a history entry.
function IconsExplorer() {
  const [search, setSearch] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ throttleMs: 250, clearOnDefault: true }),
  );
  const [vendorFilter, setVendorFilter] = useQueryState(
    "vendor",
    parseAsString.withOptions({ history: "push", clearOnDefault: true }),
  );

  const [folderFilter, setFolderFilter] = useState<string[] | undefined>();

  // Keep typing fluid: the input tracks `search`, but the heavy filter reads a
  // deferred value so the 5k-item recompute never blocks keystrokes.
  const deferredSearch = useDeferredValue(search);
  const isStale = deferredSearch !== search;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  // Explicit per-axis variant picks. Absent = use the vendor's default; "" = show
  // all (no filter on that axis). Stale keys from another vendor are harmless
  // because the effective filter only reads the active vendor's axes.
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});
  const listParentRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const loading = catalog === null;
  const index = catalog?.index ?? null;
  const docs = catalog?.docs ?? EMPTY_DOCS;
  const vendors = catalog?.vendors ?? EMPTY_VENDORS;

  // Load the prebuilt search index once and build MiniSearch in-memory. It
  // carries both the icons and vendor metadata, so no other fetch is needed and
  // all subsequent searches are local — no network per keystroke.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/search-index.json", { signal: controller.signal });
        if (!res.ok) return;
        const data: SearchIndexFile = await res.json();
        setCatalog({
          index: createIndex(data.icons),
          docs: data.icons,
          vendors: Object.values(data.vendors),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
      }
    })();
    return () => controller.abort();
  }, []);

  // Logical-icon counts per vendor, derived from the index.
  const countsByVendor = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of docs) map.set(d.vendor, (map.get(d.vendor) ?? 0) + 1);
    return map;
  }, [docs]);

  const vendorsWithCounts = useMemo(
    () =>
      vendors.map((v) => ({
        id: v.id,
        name: v.name,
        count: countsByVendor.get(v.id) ?? 0,
        taxonomy: v.taxonomy,
      })),
    [vendors, countsByVendor],
  );

  const activeVendor = useMemo(
    () => vendors.find((v) => v.id === vendorFilter),
    [vendors, vendorFilter],
  );

  // Effective filters, derived during render (no effect): each axis falls back to
  // the vendor default; "" means "All" (no filter on that axis).
  const variantFilters = useMemo(() => {
    const spec = activeVendor?.variants;
    if (!spec) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [key, s] of Object.entries(spec)) {
      const value = variantSelections[key] ?? s.default;
      if (value) out[key] = value;
    }
    return out;
  }, [activeVendor, variantSelections]);

  // In-memory search + vendor filter, then variant-aware preview resolution.
  const icons = useMemo(() => {
    if (!index) return [] as { icon: IconDoc; src: string; dark: boolean }[];
    const { items } = runSearch(index, docs, {
      q: deferredSearch,
      vendor: vendorFilter ?? undefined,
    });

    const folderItems = folderFilter
      ? items.filter((icon) =>
          folderFilter.every((part, i) => icon.tags?.[i] === part),
        )
      : items;

    const out: { icon: IconDoc; src: string; dark: boolean }[] = [];
    for (const icon of folderItems) {
      const variant = resolveVariant(icon, variantFilters);
      if (variant) {
        out.push({
          icon,
          src: previewSrc(icon.vendor, variant.file),
          dark: isDarkLogo(icon.vendor, variant),
        });
      }
    }
    return out;
  }, [index, docs, deferredSearch, vendorFilter, variantFilters, folderFilter]);

  // Density-based columns: aim for ~TARGET-wide cells (auto-fill), so cells stay
  // compact and square at any width instead of ballooning at low column counts.
  const TARGET_CELL = 148;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const node = listParentRef.current;
    if (!node) return;

    const measure = (width: number) => {
      if (width > 0) setGridWidth(width);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });

    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  // Square cells sized to the measured width, so the bordered grid tiles exactly.
  const columns = gridWidth > 0 ? Math.max(2, Math.round(gridWidth / TARGET_CELL)) : 6;
  const cellSize = gridWidth > 0 ? Math.floor(gridWidth / columns) : TARGET_CELL;
  const rowCount = Math.ceil(icons.length / Math.max(columns, 1));

  const virtual = useVirtualizer({
    count: rowCount,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => cellSize,
    overscan: 6,
  });

  // Re-measure rows when the cell size changes (column/width breakpoint).
  useEffect(() => {
    virtual.measure();
  }, [cellSize, virtual]);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar
          vendors={vendorsWithCounts}
          docs={docs}
          active={vendorFilter ?? undefined}
          activePath={folderFilter}
          onSelect={(id) => {
            setVendorFilter(id ?? null);
            setFolderFilter(undefined);
          }}
          onSelectPath={setFolderFilter}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b bg-card/40 px-6 py-4 backdrop-blur">
            <SidebarTrigger className="mb-3" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {loading
                    ? "Loading icons..."
                    : search.trim()
                      ? `Showing ${icons.length} ${icons.length === 1 ? "result" : "results"} for “${search.trim()}”`
                      : `Showing ${icons.length} ${icons.length === 1 ? "icon" : "icons"}`}
                </p>
                {vendorFilter && (
                  <p className="text-xs text-muted-foreground">
                    Filtered by {activeVendor?.name ?? vendorFilter}
                  </p>
                )}
              </div>
              <div className="w-full max-w-md">
                <InputGroup>
                  <InputGroupInput
                    type="search"
                    placeholder="search archive..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <Search />
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </div>
          </div>

          {activeVendor?.variants && Object.keys(activeVendor.variants).length > 0 && (
            <div className="border-b bg-card/30 px-6 py-3">
              <div className="flex flex-wrap gap-4">
                {Object.entries(activeVendor.variants).map(([key, spec]) => {
                  const current = variantSelections[key] ?? spec.default;
                  return (
                    <div key={key} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {spec.title ?? key}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant={variantSelections[key] === "" ? "secondary" : "ghost"}
                            onClick={() => setVariantSelections((prev) => ({ ...prev, [key]: "" }))}
                          >
                            All
                          </Button>
                          {(spec.enum ?? []).map((option) => (
                            <Button
                              key={option}
                              size="sm"
                              variant={current === option ? "secondary" : "ghost"}
                              onClick={() =>
                                setVariantSelections((prev) => ({ ...prev, [key]: option }))
                              }
                            >
                              {option}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto bg-white" ref={listParentRef}>
            {loading ? (
              <GridSkeleton />
            ) : (
              <div
                className="grid items-start gap-6 p-6 transition-opacity duration-150"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  opacity: isStale ? 0.6 : 1,
                }}
              >
                {icons.map(({ icon, src }) => (
                  <div
                    key={icon.id}
                    className="group flex min-w-0 flex-col gap-3"
                  >
                    <Link
                      href={`/icons/${icon.vendor}/${encodeURIComponent(icon.name)}`}
                      title={icon.description || icon.name}
                      className="flex min-w-0 flex-col gap-3"
                    >
                      <div className="flex min-h-40 w-full items-center justify-center bg-white">
                        <img
                          src={src}
                          alt={icon.name}
                          loading="lazy"
                          className="block h-auto max-h-72 w-auto max-w-full object-contain"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-black">
                          {icon.name}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {icon.vendor}
                        </div>
                      </div>
                    </Link>

                    <a
                      href={src}
                      download
                      className="w-fit text-xs text-neutral-500 underline hover:text-black"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}

            {!loading && icons.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">
                No icons found. Try a different search or set.
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function GridSkeleton() {
  return (
    <div className="bg-card">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
        {Array.from({ length: 30 }, (_, i) => (
          <div
            key={i}
            className="flex aspect-square flex-col items-center justify-center gap-2.5 border-r border-b p-3"
          >
            <Skeleton className="h-12 w-12 rounded-lg" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  // nuqs/useQueryState reads useSearchParams(), which needs a Suspense boundary.
  return (
    <Suspense fallback={<GridSkeleton />}>
      <IconsExplorer />
    </Suspense>
  );
}
