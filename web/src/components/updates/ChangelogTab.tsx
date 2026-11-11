import { useEffect, useState, useMemo } from "react";
import {
  RiExternalLinkLine as ExternalLink,
  RiHistoryLine as History,
  RiInformationLine as Info,
  RiLoader4Line as LoaderCircle,
  RiRefreshLine as Refresh,
  RiSearchLine as Search,
  RiArrowDownSLine as ChevronDown,
} from "@remixicon/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { updates } from "@/api/client";
import type { GitHubReleaseInfo } from "@/types";
import { cn } from "@/lib/utils";
import MarkdownRenderer from "./MarkdownRenderer";

export default function ChangelogTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [releases, setReleases] = useState<GitHubReleaseInfo[]>([]);
  const [currentVersion, setCurrentVersion] = useState("0.1.1-beta");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const loadReleases = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await updates.releases();
      const list = res.releases || [];
      setReleases(list);
      setCurrentVersion(res.currentVersion || "0.1.1-beta");
      // By default expand the newest release
      if (list.length > 0 && !isManual) {
        setExpandedIds(new Set([list[0].id]));
      }
    } catch {
      // Ignore load error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReleases();
  }, []);

  const filteredReleases = useMemo(() => {
    if (!searchQuery.trim()) return releases;
    const query = searchQuery.toLowerCase().trim();
    return releases.filter(
      (rel) =>
        rel.tag.toLowerCase().includes(query) ||
        rel.name.toLowerCase().includes(query) ||
        rel.body.toLowerCase().includes(query),
    );
  }, [releases, searchQuery]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedIds.size === filteredReleases.length) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(filteredReleases.map((r) => r.id)));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allExpanded = filteredReleases.length > 0 && expandedIds.size === filteredReleases.length;

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4.5 text-primary" />
                Saturn Router Changelog
              </CardTitle>
              <CardDescription className="text-xs">
                History of official releases, new capabilities, and improvements.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {filteredReleases.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  {allExpanded ? "Collapse all" : "Expand all"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadReleases(true)}
                disabled={refreshing}
                className="h-8 text-xs gap-1.5"
              >
                <Refresh className={cn("size-3.5", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by version or feature..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8.5 h-8 text-xs"
              />
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span>Running:</span>
              <Badge variant="outline" className="font-mono text-[11px] font-medium h-5 px-1.5">
                v{currentVersion}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Releases List */}
      {filteredReleases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Info className="mb-2 size-8 opacity-40 text-primary" />
            <p className="text-sm font-medium text-foreground">
              {searchQuery.trim() ? "No matching releases found" : "No changelogs available yet"}
            </p>
            <p className="mt-0.5 max-w-sm text-xs">
              {searchQuery.trim()
                ? `No release notes match "${searchQuery}".`
                : "Release notes will appear here once published on GitHub."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReleases.map((rel) => {
            const isCurrent = rel.version === currentVersion;
            const isExpanded = expandedIds.has(rel.id);
            const title = rel.name || `Saturn Router ${rel.tag}`;

            return (
              <div
                key={rel.id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-colors"
              >
                {/* Header that acts as a collapsible toggle spanning completely edge-to-edge */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(rel.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(rel.id);
                    }
                  }}
                  className={`flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-4 py-3 sm:px-5 cursor-pointer select-none transition-colors hover:bg-muted/40 ${
                    isExpanded ? "border-b border-border bg-muted/25" : "bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform duration-200 shrink-0 ${
                        isExpanded ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                    <span className="text-sm font-semibold text-foreground tracking-tight">
                      {title}
                    </span>

                    {isCurrent && (
                      <Badge
                        variant="secondary"
                        className="text-[11px] font-medium h-5 px-1.5"
                      >
                        Current
                      </Badge>
                    )}

                    {rel.prerelease && (
                      <Badge
                        variant="outline"
                        className="text-[11px] font-normal text-muted-foreground border-border h-5 px-1.5"
                      >
                        Pre-release
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                    <span className="text-xs text-muted-foreground">
                      {new Date(rel.publishedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>

                    {rel.htmlUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 px-2.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(rel.htmlUrl, "_blank");
                        }}
                      >
                        <ExternalLink className="size-3" />
                        View on GitHub
                      </Button>
                    )}
                  </div>
                </div>

                {/* Collapsible Content */}
                {isExpanded && (
                  <div className="p-4 sm:p-5">
                    {rel.body ? (
                      <MarkdownRenderer content={rel.body} stripFirstH1={true} />
                    ) : (
                      <p className="text-muted-foreground italic text-xs">
                        No additional release description provided.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
