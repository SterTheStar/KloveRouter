export interface DesignTokens {
  fontFamily: string;
  borderRadius: string;
  spacing: string;
  shadow: string;
  borderWidth: string;
}

export interface DesignPalette {
  primary: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
  border: string;
}

export interface DesignSkill {
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  category: "UI Design";
  aesthetic: string;
  author: string;
  version: string;
  source_url: string;
  palette: DesignPalette;
  tokens: DesignTokens;
  rules: string[];
  content: string;
  is_installed?: boolean;
  installed_id?: string;
  is_active?: boolean;
}
