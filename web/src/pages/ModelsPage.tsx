import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RiLoader4Line as LoaderCircle, RiSearchLine as Search, RiFilterLine as Filter, RiArrowDownSLine as ChevronDown, RiArrowRightSLine as ChevronRight, RiPlayCircleLine as PlayCircleLine, RiCheckLine as CheckLine, RiCloseLine as CloseLine } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { models, stats } from "../api/client";
import type { ModelWithProvider } from "../types";
import { useToast } from "../components/ui/toast";

type SourceFilter = "all" | "manual" | "synced";

export default function ModelsPage() {
  const { success, error: notifyError } = useToast();
  const [list, setList] = useState<ModelWithProvider[]>([]);
  const [tpsMap, setTpsMap] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, "success" | "error">>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [modelList, tpsData] = await Promise.all([models.listAll(), stats.tps()]);
      setList(modelList);
      const map: Record<string, number | null> = {};
      for (const item of tpsData) {
        map[item.model_id] = item.tps;
      }
      setTpsMap(map);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const providers = useMemo(() => {
    const names = new Set(list.map((m) => m.provider_name));
    return Array.from(names).sort();
  }, [list]);

  const filteredList = useMemo(() => {
    let result = list;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.model_id.toLowerCase().includes(q) ||
          (m.display_name?.toLowerCase().includes(q) ?? false) ||
          m.provider_name.toLowerCase().includes(q)
      );
    }

    if (sourceFilter === "manual") {
      result = result.filter((m) => m.is_manual === 1);
    } else if (sourceFilter === "synced") {
      result = result.filter((m) => m.is_manual === 0);
    }

    if (selectedProviders.size > 0) {
      result = result.filter((m) => selectedProviders.has(m.provider_name));
    }

    return result;
  }, [list, searchQuery, sourceFilter, selectedProviders]);

  const grouped = useMemo(() => {
    const groups: Record<string, ModelWithProvider[]> = {};
    for (const model of filteredList) {
      if (!groups[model.provider_name]) {
        groups[model.provider_name] = [];
      }
      groups[model.provider_name].push(model);
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
      setTestResult((prev) => ({ ...prev, [modelId]: result.success ? "success" : "error" }));
      result.success ? success("Model test passed") : notifyError("Model test failed", "The provider did not return a successful response.");
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

  if (loading) return <div className="flex justify-center p-12"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Models</h1>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search models or providers..." className="h-8 pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <Filter className="size-4" />Filters
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Source</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={sourceFilter === "all"} onCheckedChange={() => setSourceFilter("all")}>All</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={sourceFilter === "manual"} onCheckedChange={() => setSourceFilter("manual")}>Manual</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={sourceFilter === "synced"} onCheckedChange={() => setSourceFilter("synced")}>Auto-synced</DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Providers</DropdownMenuLabel>
              {providers.map((name) => (
                <DropdownMenuCheckboxItem key={name} checked={selectedProviders.has(name)} onCheckedChange={() => toggleProvider(name)}>
                  {name}
                </DropdownMenuCheckboxItem>
              ))}
              {providers.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No providers</div>}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <h2 className="font-heading text-lg font-medium">No active models</h2>
          <p className="mt-1 text-sm text-muted-foreground">Models from active providers will appear here.</p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0 gap-0">
          <CardHeader className="flex flex-row items-center justify-between py-(--card-spacing)">
            <CardTitle>Active models <span className="text-muted-foreground">({filteredList.length})</span></CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model ID</TableHead>
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
                    <TableRow className="bg-muted/30 cursor-pointer" onClick={() => toggleCollapse(providerName)}>
                      <TableCell colSpan={6} className="font-medium">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon-xs" className="size-6" onClick={(e) => { e.stopPropagation(); toggleCollapse(providerName); }}>
                            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                          </Button>
                          <Avatar className="size-5">
                            <AvatarImage src={models[0].provider_avatar ?? undefined} />
                            <AvatarFallback className="text-[10px]">{providerName.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {providerName}
                          <span className="text-xs text-muted-foreground">({models.length})</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {!isCollapsed && models.map((model) => {
                      const tps = tpsMap[model.id];
                      const result = testResult[model.id];
                      const fullModelId = `${model.provider_name.toLowerCase().replace(/\s+/g, "")}/${model.model_id}`;
                      return (
                        <TableRow key={model.id}>
                          <TableCell className="font-mono text-xs">{fullModelId}</TableCell>
                          <TableCell>{model.display_name || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>{model.provider_name}</TableCell>
                          <TableCell><Badge variant={model.is_manual ? "outline" : "secondary"}>{model.is_manual ? "Manual" : "Auto-synced"}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{tps !== undefined && tps !== null ? tps.toFixed(1) : "—"}</TableCell>
                          <TableCell>
                            <div className="flex h-7 items-center justify-center">
                              {result === "success" ? <CheckLine className="block size-4 text-green-500" />
                                : result === "error" ? <CloseLine className="block size-4 text-destructive" />
                                : <Button variant="ghost" size="icon-xs" className="size-7" onClick={(e) => { e.stopPropagation(); testModel(model.id); }} disabled={testingId === model.id}>
                                    {testingId === model.id ? <LoaderCircle className="size-5 animate-spin" /> : <PlayCircleLine className="size-5" />}
                                  </Button>}
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
