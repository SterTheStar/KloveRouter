export type { DesignSkill, DesignPalette, DesignTokens } from "./design-skills.types";

export interface CustomSkill {
  id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  slug?: string;
  source?: "custom" | "marketplace" | "design";
  author?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceSkill {
  slug: string;
  name: string;
  title?: string;
  description: string;
  category: string;
  framework?: string;
  verification?: string;
  source_url?: string;
  author?: string;
  tags?: string[];
  content?: string;
  version?: string;
  is_installed?: boolean;
  installed_id?: string;
  is_active?: boolean;
}

export interface MarketplaceResponse {
  total: number;
  categories: string[];
  skills: MarketplaceSkill[];
}
