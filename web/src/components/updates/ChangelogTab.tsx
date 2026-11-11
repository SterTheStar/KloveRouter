import { useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  RiExternalLinkLine as ExternalLink,
  RiHistoryLine as History,
  RiInformationLine as Info,
  RiLoader4Line as LoaderCircle,
  RiRefreshLine as Refresh,
  RiSearchLine as Search,
  RiSparklingLine as Sparkling,
} from "@remixicon/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { updates } from "@/api/client";
import type { GitHubReleaseInfo } from "@/types";

export default function ChangelogTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [releases, setReleases] = useState<GitHubReleaseInfo[]>([]);
  const [currentVersion, setCurrentVersion] = useState("0.1.0-beta.1");
  const [searchQuery, setSearchQuery] = useState("");

  const loadReleases = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await updates.releases();
      setReleases(res.releases || []);
      setCurrentVersion(res.currentVersion || "0.1.0-beta.1");
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

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <History className="size-5 text-primary" />
                Saturn Router Changelog
              </CardTitle>
              <CardDescription>
                Browse the complete history of features, improvements, and fixes released.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadReleases(true)}
                disabled={refreshing}
                className="gap-2"
              >
                {refreshing ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Refresh className="size-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by version, feature, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Running version:{" "}
              <Badge variant="outline" className="font-mono text-[11px] font-semibold">
                v{currentVersion}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Releases List */}
      {filteredReleases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Info className="mb-3 size-10 opacity-40 text-primary" />
            <p className="text-base font-medium text-foreground">
              {searchQuery.trim()
                ? "No matching releases found"
                : "No changelogs available yet"}
            </p>
            <p className="mt-1 max-w-md text-xs">
              {searchQuery.trim()
                ? `No release notes found matching "${searchQuery}". Try another search term.`
                : "Release notes and changelogs will appear here once published on GitHub."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredReleases.map((rel) => {
            const isCurrent = rel.version === currentVersion;
            return (
              <Card
                key={rel.id}
                className={`overflow-hidden transition-colors ${
                  isCurrent ? "border-emerald-500/40 bg-emerald-500/5 shadow-xs" : ""
                }`}
              >
                <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Sparkling className="size-4 text-primary" />
                        <CardTitle className="text-base">
                          {rel.name || rel.tag}
                        </CardTitle>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {rel.tag}
                        </Badge>
                        {isCurrent && (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs"
                          >
                            Currently Installed
                          </Badge>
                        )}
                        {rel.prerelease && (
                          <Badge variant="outline" className="text-xs text-amber-500">
                            Pre-release
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        Published on {new Date(rel.publishedAt).toLocaleDateString()}
                      </CardDescription>
                    </div>

                    {rel.htmlUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs gap-1.5 self-start sm:self-center"
                        onClick={() => window.open(rel.htmlUrl, "_blank")}
                      >
                        <ExternalLink className="size-3.5" />
                        View on GitHub
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="max-h-96 overflow-y-auto text-sm text-foreground prose dark:prose-invert max-w-none">
                    {rel.body ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {rel.body}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic text-xs">
                        No additional release description provided.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
