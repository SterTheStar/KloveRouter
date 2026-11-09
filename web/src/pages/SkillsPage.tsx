import { useEffect, useMemo, useState, useRef } from "react";
import {
  RiSparklingLine,
  RiStore2Line,
  RiCheckLine,
  RiAddLine,
  RiEditLine,
  RiDeleteBinLine,
  RiDownloadCloud2Line,
  RiSearchLine,
  RiEyeLine,
  RiFileCopyLine,
  RiLoader4Line,
  RiInformationLine,
  RiExternalLinkLine,
  RiFilter3Line,
  RiVerifiedBadgeLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Markdown } from "../components/chat/Markdown";
import { customSkills } from "../api/client";
import { useToast } from "../components/ui/toast";
import type { CustomSkill, MarketplaceSkill } from "../types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 36;

function parseSkillMarkdown(raw: string) {
  let body = raw || "";
  const meta: Record<string, string> = {};

  const frontmatterMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    body = body.slice(frontmatterMatch[0].length).trim();
    const lines = yaml.split("\n");
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+):\s*(?:"([^"]*)"|'([^']*)'|(.*))$/);
      if (match) {
        const key = match[1];
        const val = match[2] || match[3] || match[4] || "";
        meta[key] = val.trim();
      }
    }
  }

  return { meta, body };
}

export default function SkillsPage() {
  const { notifySuccess, notifyError } = useToast();

  const [activeTab, setActiveTab] = useState<"installed" | "marketplace">("installed");

  // Installed state
  const [installedSkills, setInstalledSkills] = useState<CustomSkill[]>([]);
  const [installedLoading, setInstalledLoading] = useState(true);
  const [installedSearch, setInstalledSearch] = useState("");

  // Marketplace state
  const [marketplaceSkills, setMarketplaceSkills] = useState<MarketplaceSkill[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [totalMarketplace, setTotalMarketplace] = useState(0);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marketplacePage, setMarketplacePage] = useState(1);
  const [marketplaceSearch, setMarketplaceSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // View / Details Dialog state
  const [viewSkill, setViewSkill] = useState<{
    slug?: string;
    name: string;
    description?: string;
    category?: string;
    author?: string;
    framework?: string;
    verification?: string;
    source_url?: string;
    content: string;
    is_installed?: boolean;
    installed_id?: string;
    is_active?: boolean;
    isLoadingContent?: boolean;
  } | null>(null);

  // Edit / Create Dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("Custom");
  const [formContent, setFormContent] = useState("");
  const [savingSkill, setSavingSkill] = useState(false);

  // Action states
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load installed skills
  const loadInstalled = async () => {
    setInstalledLoading(true);
    try {
      const data = await customSkills.list();
      setInstalledSkills(data);
    } catch (e: any) {
      notifyError("Failed to load installed skills", e.message);
    } finally {
      setInstalledLoading(false);
    }
  };

  // Load marketplace skills from server
  const fetchMarketplace = async (page: number, append = false) => {
    if (append) setLoadingMore(true);
    else setMarketplaceLoading(true);

    try {
      const res = await customSkills.listMarketplace({
        search: marketplaceSearch.trim() || undefined,
        category: selectedCategory !== "All" ? selectedCategory : undefined,
        page,
        limit: PAGE_SIZE,
      });

      setTotalMarketplace(res.total);
      if (res.categories && res.categories.length > 0) {
        setCategories(res.categories);
      }
      setMarketplaceSkills((prev) => (append ? [...prev, ...res.skills] : res.skills));
      setMarketplacePage(page);
    } catch (e: any) {
      notifyError("Failed to load marketplace", e.message);
    } finally {
      setMarketplaceLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadInstalled();
  }, []);

  // Fetch marketplace when category or tab changes
  useEffect(() => {
    if (activeTab === "marketplace") {
      fetchMarketplace(1, false);
    }
  }, [activeTab, selectedCategory]);

  // Debounced search for marketplace
  const handleMarketplaceSearchChange = (value: string) => {
    setMarketplaceSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchMarketplace(1, false);
    }, 350);
  };

  // Filtered installed skills (client-side)
  const filteredInstalled = useMemo(() => {
    const q = installedSearch.toLowerCase().trim();
    if (!q) return installedSkills;
    return installedSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        (s.content && s.content.toLowerCase().includes(q)),
    );
  }, [installedSkills, installedSearch]);

  // Toggle active state
  const handleToggle = async (id: string) => {
    setActionInProgress(id);
    try {
      const updated = await customSkills.toggle(id);
      setInstalledSkills((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: updated.is_active } : s)),
      );
      setMarketplaceSkills((prev) =>
        prev.map((m) => (m.installed_id === id ? { ...m, is_active: updated.is_active } : m)),
      );
      if (viewSkill && viewSkill.installed_id === id) {
        setViewSkill({ ...viewSkill, is_active: updated.is_active });
      }
    } catch (e: any) {
      notifyError("Failed to toggle skill", e.message);
    } finally {
      setActionInProgress(null);
    }
  };

  // Install skill from marketplace
  const handleInstallFromMarketplace = async (item: MarketplaceSkill) => {
    setActionInProgress(item.slug);
    try {
      const created = await customSkills.installMarketplace(item.slug);
      await loadInstalled();
      setMarketplaceSkills((prev) =>
        prev.map((s) =>
          s.slug === item.slug
            ? { ...s, is_installed: true, installed_id: created.id, is_active: created.is_active }
            : s,
        ),
      );
      if (viewSkill && viewSkill.slug === item.slug) {
        setViewSkill({
          ...viewSkill,
          content: created.content,
          is_installed: true,
          installed_id: created.id,
          is_active: created.is_active,
        });
      }
      notifySuccess(`Skill installed: ${item.name}`);
    } catch (e: any) {
      notifyError("Installation failed", e.message);
    } finally {
      setActionInProgress(null);
    }
  };

  // Uninstall skill
  const handleUninstall = async (id: string, name?: string, slug?: string) => {
    if (!confirm(`Are you sure you want to uninstall "${name || "this skill"}"?`)) return;
    setActionInProgress(id);
    try {
      await customSkills.remove(id);
      setInstalledSkills((prev) => prev.filter((s) => s.id !== id));
      setMarketplaceSkills((prev) =>
        prev.map((m) =>
          m.installed_id === id || (slug && m.slug === slug)
            ? { ...m, is_installed: false, installed_id: undefined, is_active: false }
            : m,
        ),
      );
      if (viewSkill && (viewSkill.installed_id === id || (slug && viewSkill.slug === slug))) {
        setViewSkill({
          ...viewSkill,
          is_installed: false,
          installed_id: undefined,
          is_active: false,
        });
      }
      notifySuccess("Skill uninstalled");
    } catch (e: any) {
      notifyError("Failed to uninstall", e.message);
    } finally {
      setActionInProgress(null);
    }
  };

  // Lazy-load details & open markdown view modal
  const handleOpenDetails = async (item: MarketplaceSkill) => {
    // Open immediately with metadata & loading state
    setViewSkill({
      slug: item.slug,
      name: item.name,
      description: item.description,
      category: item.category,
      author: item.author,
      framework: item.framework,
      verification: item.verification,
      source_url: item.source_url,
      content: item.content || "",
      is_installed: item.is_installed,
      installed_id: item.installed_id,
      is_active: item.is_active,
      isLoadingContent: !item.content,
    });

    if (!item.content) {
      try {
        const full = await customSkills.getMarketplace(item.slug);
        setViewSkill((curr) => {
          if (!curr || curr.slug !== item.slug) return curr;
          return {
            ...curr,
            content: full.content || "",
            isLoadingContent: false,
          };
        });
      } catch {
        setViewSkill((curr) => (curr ? { ...curr, isLoadingContent: false } : null));
      }
    }
  };

  const handleOpenInstalledDetails = (skill: CustomSkill) => {
    setViewSkill({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      author: skill.author,
      content: skill.content,
      is_installed: true,
      installed_id: skill.id,
      is_active: skill.is_active,
      isLoadingContent: false,
    });
  };

  // Create / Edit Custom Skill
  const handleOpenCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormCategory("Custom");
    setFormContent("");
    setShowEditDialog(true);
  };

  const handleOpenEdit = (skill: CustomSkill) => {
    setEditingId(skill.id);
    setFormName(skill.name);
    setFormDescription(skill.description || "");
    setFormCategory(skill.category || "Custom");
    setFormContent(skill.content);
    setShowEditDialog(true);
  };

  const handleSaveSkill = async () => {
    if (!formName.trim() || !formContent.trim()) {
      notifyError("Validation error", "Name and prompt content are required");
      return;
    }
    setSavingSkill(true);
    try {
      if (editingId) {
        const updated = await customSkills.update(editingId, {
          name: formName.trim(),
          description: formDescription.trim(),
          category: formCategory.trim(),
          content: formContent,
        });
        setInstalledSkills((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, ...updated } : s)),
        );
        notifySuccess("Skill updated");
      } else {
        const created = await customSkills.create({
          name: formName.trim(),
          description: formDescription.trim(),
          category: formCategory.trim(),
          content: formContent,
        });
        setInstalledSkills((prev) => [created, ...prev]);
        notifySuccess("Skill created");
      }
      setShowEditDialog(false);
    } catch (e: any) {
      notifyError("Failed to save skill", e.message);
    } finally {
      setSavingSkill(false);
    }
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeCount = useMemo(
    () => installedSkills.filter((s) => s.is_active).length,
    [installedSkills],
  );

  const hasMoreMarketplace = marketplaceSkills.length < totalMarketplace;

  // Parsed details for the modal view
  const modalParsed = useMemo(() => {
    if (!viewSkill || !viewSkill.content) return { meta: {}, body: "" };
    return parseSkillMarkdown(viewSkill.content);
  }, [viewSkill]);

  return (
    <div className="w-full space-y-6 p-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <RiSparklingLine className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Skills &amp; Prompts
            </h1>
          </div>
          <p className="text-sm text-tertiary">
            Inject structured expert instructions and modular capabilities from the Agent Skill Exchange directly into model prompts.
          </p>
        </div>

        <Button onClick={handleOpenCreate} className="gap-2">
          <RiAddLine className="size-4" />
          Create custom skill
        </Button>
      </div>

      {/* Tabs & Search Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === "installed" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("installed")}
            className="gap-2"
          >
            <RiCheckLine className="size-4" />
            <span>Installed</span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {installedSkills.length}
            </Badge>
          </Button>

          <Button
            variant={activeTab === "marketplace" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("marketplace")}
            className="gap-2"
          >
            <RiStore2Line className="size-4" />
            <span>Marketplace</span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {totalMarketplace > 0 ? totalMarketplace.toLocaleString() : "..."}
            </Badge>
          </Button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-72">
          <RiSearchLine className="absolute left-2.5 top-2.5 size-4 text-tertiary" />
          {activeTab === "installed" ? (
            <Input
              placeholder="Search installed skills..."
              value={installedSearch}
              onChange={(e) => setInstalledSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          ) : (
            <Input
              placeholder="Search 3,200+ agent skills..."
              value={marketplaceSearch}
              onChange={(e) => handleMarketplaceSearchChange(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* INSTALLED TAB */}
      {/* ========================================================================= */}
      {activeTab === "installed" && (
        <div className="space-y-4">
          {installedSkills.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card/60 px-4 py-2.5 text-xs text-tertiary">
              <span className="flex items-center gap-1.5">
                <RiInformationLine className="size-4 text-primary shrink-0" />
                <span>
                  <strong>{activeCount}</strong> of {installedSkills.length} skills active. Active
                  skills are merged automatically into every proxy chat request.
                </span>
              </span>
            </div>
          )}

          {installedLoading ? (
            <div className="flex justify-center p-12">
              <RiLoader4Line className="size-6 animate-spin text-tertiary" />
            </div>
          ) : filteredInstalled.length === 0 ? (
            <Card className="border-dashed py-12 text-center">
              <CardContent className="space-y-3">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                  <RiSparklingLine className="size-6 text-tertiary" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-medium text-foreground">
                    {installedSearch ? "No matching skills found" : "No installed skills"}
                  </h3>
                  <p className="text-xs text-tertiary max-w-sm mx-auto">
                    {installedSearch
                      ? "Try a different search term or clear the filter."
                      : "Explore over 3,200 community agent skills in the Marketplace or create a custom prompt from scratch."}
                  </p>
                </div>
                {!installedSearch && (
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab("marketplace")}
                      className="gap-1.5"
                    >
                      <RiStore2Line className="size-4" />
                      Browse marketplace
                    </Button>
                    <Button size="sm" onClick={handleOpenCreate} className="gap-1.5">
                      <RiAddLine className="size-4" />
                      New skill
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredInstalled.map((skill) => (
                <Card
                  key={skill.id}
                  className={cn(
                    "flex flex-col justify-between transition-colors",
                    !skill.is_active && "opacity-75 bg-card/40",
                  )}
                >
                  <CardHeader className="space-y-2 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base truncate">{skill.name}</CardTitle>
                          {skill.category && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                              {skill.category}
                            </Badge>
                          )}
                          <Badge
                            variant={skill.source === "marketplace" ? "secondary" : "default"}
                            className="text-[10px] py-0 px-1.5 font-normal"
                          >
                            {skill.source === "marketplace" ? "Marketplace" : "Custom"}
                          </Badge>
                        </div>
                        {skill.description ? (
                          <p className="text-xs text-tertiary line-clamp-2">{skill.description}</p>
                        ) : (
                          <p className="text-xs font-mono text-tertiary truncate">
                            {skill.content.split("\n")[0]}
                          </p>
                        )}
                      </div>

                      <Switch
                        checked={skill.is_active}
                        onCheckedChange={() => handleToggle(skill.id)}
                        disabled={actionInProgress === skill.id}
                        aria-label={`Toggle ${skill.name}`}
                      />
                    </div>
                  </CardHeader>

                  <CardFooter className="flex items-center justify-between border-t border-border pt-3 text-xs">
                    <span className="text-tertiary text-[11px]">
                      {skill.is_active ? "Active in prompts" : "Disabled"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleOpenInstalledDetails(skill)}
                        className="gap-1 text-xs"
                      >
                        <RiEyeLine className="size-3.5" />
                        Prompt
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleOpenEdit(skill)}
                        className="gap-1 text-xs"
                      >
                        <RiEditLine className="size-3.5" />
                        Edit
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleUninstall(skill.id, skill.name, skill.slug)}
                        disabled={actionInProgress === skill.id}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <RiDeleteBinLine className="size-3.5" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MARKETPLACE TAB (3,200+ Live Skills with Lazy Loading) */}
      {/* ========================================================================= */}
      {activeTab === "marketplace" && (
        <div className="space-y-4">
          {/* Categories Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <span className="flex items-center gap-1 text-xs text-tertiary mr-1">
              <RiFilter3Line className="size-3.5" /> Category:
            </span>
            <Button
              variant={selectedCategory === "All" ? "default" : "outline"}
              size="xs"
              onClick={() => setSelectedCategory("All")}
              className="text-xs rounded-full"
            >
              All ({totalMarketplace > 0 ? totalMarketplace.toLocaleString() : "..."})
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                size="xs"
                onClick={() => setSelectedCategory(cat)}
                className="text-xs rounded-full"
              >
                {cat}
              </Button>
            ))}
          </div>

          {marketplaceLoading && marketplaceSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 space-y-3">
              <RiLoader4Line className="size-8 animate-spin text-primary" />
              <p className="text-xs text-tertiary">Loading live skills from Agent Skill Exchange...</p>
            </div>
          ) : marketplaceSkills.length === 0 ? (
            <Card className="py-12 text-center border-dashed">
              <CardContent className="space-y-2">
                <p className="text-sm font-medium text-foreground">No marketplace skills found</p>
                <p className="text-xs text-tertiary">
                  Try clearing your search query or choosing another category.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {marketplaceSkills.map((item) => (
                  <Card
                    key={item.slug}
                    className="flex flex-col justify-between hover:border-border-strong transition-colors"
                  >
                    <CardHeader className="space-y-2 pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal truncate max-w-[180px]">
                          {item.category}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {item.verification === "security_reviewed" && (
                            <span title="Security Reviewed">
                              <RiVerifiedBadgeLine className="size-3.5 text-primary" />
                            </span>
                          )}
                          {item.is_installed && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-1 font-medium">
                              <RiCheckLine className="size-3 text-primary" />
                              Installed
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <CardTitle className="text-sm font-semibold line-clamp-1">{item.name}</CardTitle>
                        <p className="text-xs text-tertiary line-clamp-3 leading-relaxed">
                          {item.description || "No description provided."}
                        </p>
                      </div>

                      {item.framework && (
                        <div className="pt-1">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-tertiary">
                            {item.framework}
                          </span>
                        </div>
                      )}
                    </CardHeader>

                    <CardFooter className="flex items-center justify-between border-t border-border pt-3">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleOpenDetails(item)}
                        className="text-xs gap-1"
                      >
                        <RiEyeLine className="size-3.5" />
                        Details
                      </Button>

                      {item.is_installed ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              item.installed_id &&
                              handleUninstall(item.installed_id, item.name, item.slug)
                            }
                            disabled={actionInProgress === item.installed_id}
                            className="text-xs text-destructive hover:bg-destructive/10"
                          >
                            Uninstall
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="xs"
                          onClick={() => handleInstallFromMarketplace(item)}
                          disabled={actionInProgress === item.slug}
                          className="text-xs gap-1.5"
                        >
                          {actionInProgress === item.slug ? (
                            <RiLoader4Line className="size-3.5 animate-spin" />
                          ) : (
                            <RiDownloadCloud2Line className="size-3.5" />
                          )}
                          Install
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>

              {/* Lazy Loading More Button */}
              {hasMoreMarketplace && (
                <div className="flex flex-col items-center justify-center pt-4 pb-2 space-y-2">
                  <p className="text-xs text-tertiary">
                    Showing {marketplaceSkills.length.toLocaleString()} of {totalMarketplace.toLocaleString()} skills
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchMarketplace(marketplacePage + 1, true)}
                    disabled={loadingMore}
                    className="gap-2"
                  >
                    {loadingMore && <RiLoader4Line className="size-4 animate-spin" />}
                    {loadingMore ? "Loading more..." : "Load more skills"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* REAL MARKDOWN VIEW DETAILS MODAL */}
      {/* ========================================================================= */}
      <Dialog open={Boolean(viewSkill)} onOpenChange={(open) => !open && setViewSkill(null)}>
        <DialogContent className="sm:max-w-5xl md:max-w-6xl w-[95vw] max-w-6xl max-md:h-[88vh] md:aspect-[16/9] max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0">
          {viewSkill && (
            <>
              <DialogHeader className="px-6 py-4 border-b border-border bg-card/40 shrink-0 space-y-2 text-left pr-12">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-xl font-semibold text-foreground">
                    {viewSkill.name}
                  </DialogTitle>
                  {viewSkill.category && (
                    <Badge variant="outline" className="text-xs">
                      {viewSkill.category}
                    </Badge>
                  )}
                  {viewSkill.framework && (
                    <Badge variant="secondary" className="text-xs">
                      {viewSkill.framework}
                    </Badge>
                  )}
                  {viewSkill.verification === "security_reviewed" && (
                    <Badge variant="secondary" className="text-xs gap-1 text-primary">
                      <RiVerifiedBadgeLine className="size-3" />
                      Security Reviewed
                    </Badge>
                  )}
                  {viewSkill.is_installed && (
                    <Badge variant="secondary" className="text-xs gap-1 font-medium">
                      <RiCheckLine className="size-3 text-primary" />
                      Installed
                    </Badge>
                  )}
                </div>

                {viewSkill.description && (
                  <DialogDescription className="text-xs text-tertiary leading-relaxed">
                    {viewSkill.description}
                  </DialogDescription>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-tertiary pt-1">
                  <div className="flex items-center gap-4">
                    {viewSkill.author && <span>Author: <strong>{viewSkill.author}</strong></span>}
                    {viewSkill.slug && <span className="font-mono text-[11px]">slug: {viewSkill.slug}</span>}
                    {viewSkill.source_url && (
                      <a
                        href={viewSkill.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <span>Upstream source</span>
                        <RiExternalLinkLine className="size-3" />
                      </a>
                    )}
                  </div>

                  {!viewSkill.isLoadingContent && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleCopyPrompt(modalParsed.body || viewSkill.content)}
                      className="gap-1 text-xs h-7 px-2"
                    >
                      {copied ? (
                        <RiCheckLine className="size-3.5 text-success" />
                      ) : (
                        <RiFileCopyLine className="size-3.5" />
                      )}
                      {copied ? "Copied" : "Copy markdown"}
                    </Button>
                  )}
                </div>
              </DialogHeader>

              {/* Rendered Markdown Body taking 100% of the modal width and height */}
              <div className="flex-1 overflow-y-auto px-6 py-5 w-full bg-background/50">
                {viewSkill.isLoadingContent ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[220px] space-y-3">
                    <RiLoader4Line className="size-8 animate-spin text-primary" />
                    <p className="text-xs text-tertiary">Fetching real SKILL.md from GitHub...</p>
                  </div>
                ) : (
                  <div className="w-full max-w-none text-foreground leading-relaxed">
                    <Markdown content={modalParsed.body || viewSkill.content} />
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <DialogFooter className="px-6 py-3.5 border-t border-border bg-card/40 shrink-0 flex items-center justify-between sm:justify-between">
                <div className="text-xs text-tertiary">
                  Agent Skill Exchange standard (SKILL.md)
                </div>

                <div className="flex items-center gap-2">
                  {viewSkill.is_installed ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          viewSkill.installed_id &&
                          handleUninstall(viewSkill.installed_id, viewSkill.name, viewSkill.slug)
                        }
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Uninstall
                      </Button>
                      <Button
                        size="sm"
                        variant={viewSkill.is_active ? "default" : "secondary"}
                        onClick={() =>
                          viewSkill.installed_id && handleToggle(viewSkill.installed_id)
                        }
                      >
                        {viewSkill.is_active ? "Active in prompts" : "Enable skill"}
                      </Button>
                    </>
                  ) : (
                    viewSkill.slug && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const item = marketplaceSkills.find((m) => m.slug === viewSkill.slug);
                          if (item) handleInstallFromMarketplace(item);
                        }}
                        disabled={actionInProgress === viewSkill.slug}
                        className="gap-1.5"
                      >
                        {actionInProgress === viewSkill.slug ? (
                          <RiLoader4Line className="size-4 animate-spin" />
                        ) : (
                          <RiDownloadCloud2Line className="size-4" />
                        )}
                        Install skill
                      </Button>
                    )
                  )}
                  <Button variant="outline" size="sm" onClick={() => setViewSkill(null)}>
                    Close
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* CREATE / EDIT CUSTOM SKILL DIALOG */}
      {/* ========================================================================= */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit skill" : "Create custom skill"}</DialogTitle>
            <DialogDescription className="text-xs text-tertiary">
              Write a system prompt skill. Active skills are merged into every chat completion request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="skill-name" className="text-xs">
                Skill Name
              </Label>
              <Input
                id="skill-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Senior Security Auditor"
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="skill-category" className="text-xs">
                  Category
                </Label>
                <Input
                  id="skill-category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g. Development, Security"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="skill-desc" className="text-xs">
                  Short Description (optional)
                </Label>
                <Input
                  id="skill-desc"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Enforces strict type boundaries"
                  className="text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="skill-content" className="text-xs">
                  Prompt Instructions (Markdown)
                </Label>
                <span className="text-[10px] text-tertiary font-mono">
                  {formContent.length} chars
                </span>
              </div>
              <Textarea
                id="skill-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="# Role & Guidelines&#10;&#10;When assisting with code, always:&#10;1. ..."
                rows={9}
                className="font-mono text-xs leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditDialog(false)}
              disabled={savingSkill}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSkill}
              disabled={savingSkill || !formName.trim() || !formContent.trim()}
              className="gap-1.5"
            >
              {savingSkill && <RiLoader4Line className="size-4 animate-spin" />}
              {editingId ? "Update skill" : "Create skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
