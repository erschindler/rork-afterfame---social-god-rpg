export type BrandFont = "grotesk" | "serif" | "mono" | "round" | "condensed";

export type AdCategory =
  | "food"
  | "tech"
  | "finance"
  | "fitness"
  | "beauty"
  | "gaming"
  | "services"
  | "media"
  | "lifestyle"
  | "auto"
  | "home"
  | "health"
  | "legal"
  | "education"
  | "travel"
  | "pets";

/** A fictional advertiser. Every ad and its website are generated from this. */
export interface Brand {
  slug: string;
  name: string;
  cat: AdCategory;
  /** Topic ids from lib/topics used for targeting. */
  topics: string[];
  tag: string;
  /** [background, foreground, accent] */
  c: [string, string, string];
  font: BrandFont;
  mark: string;
  /** [name, price, blurb] */
  products: [string, string, string][];
  /** Headline templates. {p} product, {b} benefit, {n} brand. */
  heads: string[];
  bodies: string[];
  benefits: string[];
  fine: string;
  about: string;
}
