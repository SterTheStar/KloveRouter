import React, { useEffect, useMemo, useState } from "react";
import {
  RiLoader4Line as LoaderCircle,
  RiSearchLine as Search,
  RiFilterLine as Filter,
  RiArrowDownSLine as ChevronDown,
  RiArrowRightSLine as ChevronRight,
  RiPlayCircleLine as PlayCircleLine,
  RiCheckLine as CheckLine,
  RiCloseLine as CloseLine,
  RiPencilLine as Pencil,
  RiRefreshLine as RefreshCw,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { models, stats } from "../api/client";
import type { MetadataSource, ModelCapabilities, ModelWithProvider } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "../components/ui/toast";
import ProviderIcon from "../components/ProviderIcon";
import { modelDisplayId, modelPublicId } from "../lib/model-id";
import { useQuery } from "../hooks/useQuery";
import { invalidateModels, queryKeys } from "../lib/query-cache";
import { modelCategories, type ModelCategory } from "../lib/model-modality";
import { ModelCapabilityBadges } from "../components/ModelCapabilities";

type SourceFilter = "all" | "manual" | "synced";
type CategoryFilter = "all" | ModelCategory;

function litellmSourced(source?: MetadataSource | null): boolean {
  if (!source) return false;
  return source.context_window === "litellm" || source.max_output_tokens === "litellm" || source.reasoning_efforts === "litellm"
    || Object.values(source.capabilities ?? {}).includes("litellm");
}

export default function ModelsPage() {
  const { success, error: notifyError } = useToast();
  const { data: list = [], loading, error: queryError } = useQuery(
    queryKeys.models,
    models.listAll,
    30_000,
  );
  const [tpsMap, setTpsMap] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set(),
  );
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(
    new Set(),
  );
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    Record<string, "success" | "error">
  >({});

  useEffect(() => {
    stats.tps().then((data) => {
      const map: Record<string, number | null> = {};
      for (const item of data) map[item.model_id] = item.tps;
      setTpsMap(map);
    }).catch((e: any) => setError(e.message));
  }, []);
  useEffect(() => {
    if (queryError) setError(queryError.message);
  }, [queryError]);

  const providers = useMemo(() => {
    const names = new Set(list.map((m) => m.model_pool ? "Compound models" : m.provider_name));
    return Array.from(names).sort();
  }, [list]);

  const filteredList = useMemo(() => {
    let result = list;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          (m.model_pool ? `pool/${m.pretty_id || m.model_id}` : (m.pretty_id ? modelPublicId(m) : modelDisplayId(m))).toLowerCase().includes(q) ||
          (m.display_name?.toLowerCase().includes(q) ?? false) ||
          (m.members?.some((member) => `${member.display_name ?? ""} ${member.provider_name}`.toLowerCase().includes(q) ?? false) ?? false) ||
          m.provider_name.toLowerCase().includes(q),
      );
    }

    if (sourceFilter === "manual") {
      result = result.filter((m) => m.is_manual === 1 || m.model_pool);
    } else if (sourceFilter === "synced") {
      result = result.filter((m) => m.is_manual === 0);
    }

    if (categoryFilter !== "all") {
      result = result.filter((m) => modelCategories(m).includes(categoryFilter));
    }

    if (selectedProviders.size > 0) {
      result = result.filter((m) => selectedProviders.has(m.model_pool ? "Compound models" : m.provider_name));
    }

    return result;
  }, [list, searchQuery, sourceFilter, selectedProviders]);

  const grouped = useMemo(() => {
    const groups: Record<string, ModelWithProvider[]> = {};
    for (const model of filteredList) {
      const provider = model.model_pool ? "Compound models" : model.provider_name;
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(model);
    }
    return groups;
  }, [filteredList]);

  const toggleCollapse = (name: string) => {
    setCollapsedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const testModel = async (modelId: string) => {
    setTestingId(modelId);
    try {
      const result = await models.test(modelId);
      setTestResult((prev) => ({
        ...prev,
        [modelId]: result.success ? "success" : "error",
      }));
      result.success
        ? success("Model test passed")
        : notifyError(
            "Model test failed",
            "The provider did not return a successful response.",
          );
    } catch {
      setTestResult((prev) => ({ ...prev, [modelId]: "error" }));
      notifyError("Model test failed", "Could not reach the provider.");
    } finally {
      setTestingId(null);
    }
  };

  const toggleProvider = (name: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-normal tracking-tight text-foreground">
          Models
        </h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
          <Input
            placeholder="Search models or providers..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <Filter className="size-4" />
            Filters
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Source</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={sourceFilter === "all"}
                onCheckedChange={() => setSourceFilter("all")}
              >
                All
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={sourceFilter === "manual"}
                onCheckedChange={() => setSourceFilter("manual")}
              >
                Manual
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={sourceFilter === "synced"}
                onCheckedChange={() => setSourceFilter("synced")}
              >
                Synced
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Modality</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={categoryFilter === "all"}
                onCheckedChange={() => setCategoryFilter("all")}
              >
                All modalities
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter === "chat"}
                onCheckedChange={() => setCategoryFilter("chat")}
              >
                Chat
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter === "image"}
                onCheckedChange={() => setCategoryFilter("image")}
              >
                Image
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter === "tts"}
                onCheckedChange={() => setCategoryFilter("tts")}
              >
                Text to speech (TTS)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter === "video"}
                onCheckedChange={() => setCategoryFilter("video")}
              >
                Video
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter === "embedding"}
                onCheckedChange={() => setCategoryFilter("embedding")}
              >
                Embeddings
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter === "systemone"}
                onCheckedChange={() => setCategoryFilter("systemone")}
              >
                SystemOne Decisions
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter === "stt"}
                onCheckedChange={() => setCategoryFilter("stt")}
              >
                Speech to text (STT)
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Providers</DropdownMenuLabel>
              {providers.map((name) => (
                <DropdownMenuCheckboxItem
                  key={name}
                  checked={selectedProviders.has(name)}
                  onCheckedChange={() => toggleProvider(name)}
                >
                  {name}
                </DropdownMenuCheckboxItem>
              ))}
              {providers.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-tertiary">
                  No providers
                </div>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-border bg-background/60 py-10 text-center">
          <h2 className="text-sm font-normal text-foreground">No active models</h2>
          <p className="mt-1 text-xs text-tertiary">
            Models from active providers will appear here.
          </p>
        </div>
      ) : (
        <Card variant="plain" className="gap-0 overflow-hidden border border-border p-0">
          <CardHeader className="flex flex-row items-center justify-between py-(--card-spacing)">
            <CardTitle>
              Active models{" "}
              <span className="font-mono text-tertiary">
                ({filteredList.length})
              </span>
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader className="bg-background/60 [&_th]:h-9 [&_th]:px-3 [&_th]:font-normal [&_th]:text-tertiary">
              <TableRow>
                <TableHead>Public ID</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>TPS</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(grouped).map(([providerName, models]) => {
                const isCollapsed = collapsedProviders.has(providerName);
                return (
                  <React.Fragment key={providerName}>
                    <TableRow
                      className="cursor-pointer bg-background/60"
                      onClick={() => toggleCollapse(providerName)}
                    >
                      <TableCell colSpan={6} className="px-3 py-2.5 text-sm font-normal">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="size-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollapse(providerName);
                            }}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </Button>
                          <ProviderIcon name={providerName} src={models[0].provider_avatar} sources={models[0].provider_avatar_sources} className="size-5 text-xs" />
                          {providerName}
                          <span className="ml-1 text-xs text-tertiary">
                            ({models.length})
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {!isCollapsed &&
                      models.map((model) => {
                        const tps = tpsMap[model.id];
                        const result = testResult[model.id];
                        const canTest = !model.model_pool;
                        const fullModelId = model.model_pool ? `pool/${model.pretty_id || model.model_id}` : modelPublicId(model);
                        return (
                          <TableRow key={model.id}>
                            <TableCell className="px-3 py-2.5 font-mono text-xs">
                              {fullModelId}
                            </TableCell>
                            <TableCell className="px-3 py-2.5">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="min-w-0 truncate">
                                  {model.display_name || (
                                    <span className="text-tertiary">—</span>
                                  )}
                                </span>
                                {litellmSourced(model.metadata_source) && (
                                  <Tooltip>
                                    <TooltipTrigger
                                      render={<span />}
                                      className="inline-flex h-5 items-center rounded-md border border-border px-1.5 text-[10px] font-normal text-tertiary"
                                      aria-label="Some limits or capabilities come from the LiteLLM catalog"
                                    >
                                      LiteLLM
                                    </TooltipTrigger>
                                    <TooltipContent>Some limits or capabilities come from the LiteLLM catalog because the provider does not declare its own.</TooltipContent>
                                  </Tooltip>
                                )}
                                <ModelCapabilityBadges capabilities={model.capabilities} contextWindow={model.context_window} modelType={model.model_type} />
                                {model.effective_billing_type === "subscription" && (
                                  <Badge variant="outline" className="border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[10px] font-normal">
                                    Subscription
                                  </Badge>
                                )}
                                {model.effective_billing_type === "free" && (
                                  <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-[10px] font-normal">
                                    Free
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-sm">{model.model_pool ? "Compound model" : model.provider_name}</TableCell>
                            <TableCell className="px-3 py-2.5">
                              {model.model_pool ? (
                                <Badge variant="secondary">Compound</Badge>
                              ) : model.is_manual ? (
                                <Badge variant="outline"><Pencil className="size-3" />Added manually</Badge>
                              ) : (
                                <Badge variant="secondary"><RefreshCw className="size-3" />Synced</Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 font-mono text-xs">
                              {tps !== undefined && tps !== null
                                ? tps.toFixed(1)
                                : "—"}
                            </TableCell>
                            <TableCell className="px-3 py-2.5">
                              <div className="flex h-7 items-center justify-center">
                                {!canTest ? null : result === "success" ? (
                                  <CheckLine className="block size-4 text-success" />
                                ) : result === "error" ? (
                                  <CloseLine className="block size-4 text-destructive" />
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="size-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      testModel(model.id);
                                    }}
                                    disabled={testingId === model.id || model.model_pool}
                                  >
                                    {testingId === model.id ? (
                                      <LoaderCircle className="size-5 animate-spin" />
                                    ) : (
                                      <PlayCircleLine className="size-5" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
