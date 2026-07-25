import { RiDeleteBinLine as DeleteIcon } from "@remixicon/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { Provider } from "../types";

interface Props {
  provider: Provider;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isToggling?: boolean;
}

export default function ProviderCard({ provider, onToggle, onEdit, onDelete, isToggling }: Props) {
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      className={`cursor-pointer transition-colors hover:border-primary/50 ${!provider.is_active ? "opacity-60" : ""}`}
      onClick={() => onEdit(provider.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onEdit(provider.id);
      }}
    >
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarImage src={provider.avatar ?? undefined} />
              <AvatarFallback>{provider.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{provider.name}</div>
              <Badge variant={provider.is_active ? "secondary" : "outline"}>
                {provider.is_active ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <Switch
              checked={provider.is_active === 1}
              onCheckedChange={() => onToggle(provider.id)}
              disabled={isToggling}
              aria-label={`Toggle ${provider.name}`}
            />
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={() => onDelete(provider.id)}
              aria-label={`Delete ${provider.name}`}
            >
              <DeleteIcon className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
