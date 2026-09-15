"use client";

import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Search } from "lucide-react";

function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold">Library</span>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/docs">
                <span>API</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/about">
                <span>About</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function AboutPage() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Search Bar */}
          <div className="border-b px-6 py-4">
            <div className="max-w-md">
              <InputGroup>
                <InputGroupInput type="search" placeholder="Search icons..." />
                <InputGroupAddon align="inline-end">
                  <Search />
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>

          {/* About Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-3xl">
              <h1 className="mb-6 text-3xl font-bold">About this library</h1>

              <div className="space-y-6">
                <section>
                  <h2 className="mb-3 text-xl font-semibold">Overview</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    This is a personal library of{" "}
                    <strong>AAC (Augmentative and Alternative Communication)</strong> symbols and
                    visuals — a simple place to search, preview, and download the images used for
                    communication supports and activities.
                  </p>
                </section>

                <section>
                  <h2 className="mb-3 text-xl font-semibold">What&apos;s in it</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Symbols are organized by category (for example, Play → Games and Play → Toys)
                    and tagged with keywords so they&apos;re easy to find. Each entry can be
                    previewed on its own page and downloaded directly.
                  </p>
                </section>

                <section>
                  <h2 className="mb-3 text-xl font-semibold">Growing over time</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    New symbols and categories get added as they&apos;re created — this library is
                    a work in progress rather than a fixed set.
                  </p>
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
