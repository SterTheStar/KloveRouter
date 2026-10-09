import {
  RiDeleteBinLine as DeleteIcon,
  RiLoader4Line as LoaderCircle,
} from "@remixicon/react";
import ProviderIcon from "./ProviderIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { Provider } from "../types";
import { pathForPage, shouldHandleLinkClick } from "../lib/navigation";

interface Props {
  provider: Provider;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isToggling?: boolean;
}

export default function ProviderCard({
  provider,
  onToggle,
  onEdit,
  onDelete,
  isToggling,
}: Props) {
  return (
    <Card
      size="sm"
      className={`relative animate-in fade-in slide-in-from-bottom-2 transition-[opacity,transform,border-color] duration-300 hover:border-primary/50 ${!provider.is_active ? "opacity-60" : ""} ${isToggling ? "scale-[0.98] opacity-70" : ""}`}
      aria-busy={isToggling}
    >
      <a
        href={pathForPage("provider-detail", provider.id)}
        aria-label={`Open ${provider.name}`}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          if (!shouldHandleLinkClick(event)) return;
          event.preventDefault();
          if (!isToggling) onEdit(provider.id);
        }}
      />
      <CardContent className="pointer-events-none relative z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ProviderIcon name={provider.name} src={provider.avatar} sources={provider.avatar_sources} className="size-12" />
            <div>
              <div className="font-medium">{provider.name}</div>
              <Badge variant={provider.is_active ? "secondary" : "outline"}>
                {provider.is_active ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
          <div
            className="pointer-events-auto flex items-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <Switch
              checked={provider.is_active === 1}
              onCheckedChange={() => onToggle(provider.id)}
              disabled={isToggling}
              aria-label={`Toggle ${provider.name}`}
            />
            {isToggling ? (
              <LoaderCircle
                className="size-4 animate-spin text-muted-foreground"
                aria-label="Updating provider"
              />
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => onDelete(provider.id)}
                aria-label={`Delete ${provider.name}`}
              >
                <DeleteIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
