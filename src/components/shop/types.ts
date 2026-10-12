export interface ClientModifier {
  id: number;
  name: string;
  pricePesewas: number;
  isAvailable: boolean;
}
export interface ClientMenuItem {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string | null;
  basePricePesewas: number;
  prepMinutes: number;
  isFeatured: boolean;
  dietaryTags: string[];
  allergens: string[];
  allergensVerified: boolean;
  orderable: boolean;
  unavailableReason: string | null;
  isDemo: boolean;
  variants: { id: number; name: string; pricePesewas: number; isDefault: boolean; isAvailable: boolean }[];
  modifierGroups: { id: number; name: string; minSelect: number; maxSelect: number; modifiers: ClientModifier[] }[];
}
export interface ClientCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}
