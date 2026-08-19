export type CatalogItem = {
  category: string;
  categorySlug: string;
  name: string;
  slug: string;
  description: string;
  priceMinor: number;
  stockQty: number;
  material: string;
  dimensions: string;
  care: string;
  featuredRank: number | null;
  images: string[];
};

const categoryDetails: Record<string, { name: string; material: string; dimensions: string; care: string; images: string[] }> = {
  everyday: { name: 'Everyday', material: 'Natural canvas and solid brass', dimensions: 'Designed for comfortable daily carry', care: 'Spot clean with a damp cloth', images: [
    'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=85',
  ] },
  home: { name: 'Home', material: 'Responsibly sourced natural materials', dimensions: 'Compact proportions for everyday spaces', care: 'Wipe clean; follow the included care card', images: [
    'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1200&q=85',
  ] },
  desk: { name: 'Desk', material: 'FSC-certified wood and recycled paper', dimensions: 'Sized for a calm, organized workspace', care: 'Dust with a soft dry cloth', images: [
    'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1200&q=85',
  ] },
  kitchen: { name: 'Kitchen', material: 'Food-safe steel, glass, and hardwood', dimensions: 'Made for standard kitchen storage', care: 'Hand wash and dry thoroughly', images: [
    'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=1200&q=85',
  ] },
  outdoors: { name: 'Outdoors', material: 'Weather-ready recycled technical fabric', dimensions: 'Packable and easy to carry', care: 'Rinse after use and air dry', images: [
    'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=85',
  ] },
  travel: { name: 'Travel', material: 'Durable recycled textile and metal hardware', dimensions: 'Cabin-bag friendly proportions', care: 'Spot clean and air dry', images: [
    'https://images.unsplash.com/photo-1553531384-cc64ac80f931?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85',
  ] },
};

const products: Array<[string, string, string, number, number]> = [
  ['everyday', 'Canvas Market Tote', 'canvas-market-tote', 3800, 18],
  ['home', 'Ridge Ceramic Mug', 'ridge-ceramic-mug', 2600, 24],
  ['desk', 'Walnut Desk Tray', 'walnut-desk-tray', 5400, 10],
  ['everyday', 'Field Notebook Set', 'field-notebook-set', 1800, 40],
  ['everyday', 'Brass Key Loop', 'brass-key-loop', 2200, 32],
  ['everyday', 'Linen Pocket Pouch', 'linen-pocket-pouch', 2900, 26],
  ['everyday', 'Merino Everyday Socks', 'merino-everyday-socks', 2400, 36],
  ['everyday', 'Compact Rain Wrap', 'compact-rain-wrap', 6200, 14],
  ['everyday', 'Recycled Card Wallet', 'recycled-card-wallet', 3400, 22],
  ['everyday', 'Utility Bandana', 'utility-bandana', 1600, 45],
  ['home', 'Hand-Poured Cedar Candle', 'cedar-candle', 3200, 20],
  ['home', 'Woven Wool Throw', 'woven-wool-throw', 11800, 8],
  ['home', 'Oak Bedside Catchall', 'oak-bedside-catchall', 4600, 15],
  ['home', 'Linen Cushion Cover', 'linen-cushion-cover', 4200, 19],
  ['home', 'Stone Incense Holder', 'stone-incense-holder', 2800, 28],
  ['home', 'Soft Cotton Bath Towel', 'cotton-bath-towel', 4800, 17],
  ['home', 'Glass Bud Vase', 'glass-bud-vase', 3600, 21],
  ['desk', 'Aluminum Pen Rest', 'aluminum-pen-rest', 2100, 30],
  ['desk', 'Weekly Planning Pad', 'weekly-planning-pad', 1700, 42],
  ['desk', 'Cork Desk Mat', 'cork-desk-mat', 5800, 16],
  ['desk', 'Maple Monitor Riser', 'maple-monitor-riser', 9800, 9],
  ['desk', 'Archive Document Box', 'archive-document-box', 3100, 25],
  ['desk', 'Mechanical Pencil 01', 'mechanical-pencil-01', 2700, 34],
  ['desk', 'Cable Tidy Set', 'cable-tidy-set', 1900, 38],
  ['kitchen', 'Beech Serving Board', 'beech-serving-board', 5600, 14],
  ['kitchen', 'Glass Pantry Jar', 'glass-pantry-jar', 2400, 31],
  ['kitchen', 'Linen Tea Towel Pair', 'linen-tea-towel-pair', 2800, 27],
  ['kitchen', 'Stainless Pour-Over Cone', 'stainless-pour-over-cone', 4400, 18],
  ['kitchen', 'Olive Wood Spoon Set', 'olive-wood-spoon-set', 3900, 23],
  ['kitchen', 'Stacking Prep Bowls', 'stacking-prep-bowls', 5200, 16],
  ['kitchen', 'Stoneware Salt Cellar', 'stoneware-salt-cellar', 3000, 24],
  ['outdoors', 'Packable Picnic Blanket', 'packable-picnic-blanket', 7600, 12],
  ['outdoors', 'Enamel Camp Cup', 'enamel-camp-cup', 2300, 29],
  ['outdoors', 'Trail Water Bottle', 'trail-water-bottle', 3500, 33],
  ['outdoors', 'Pocket Field Knife', 'pocket-field-knife', 6800, 11],
  ['outdoors', 'Solar Pocket Lantern', 'solar-pocket-lantern', 4900, 20],
  ['outdoors', 'Wool Sit Pad', 'wool-sit-pad', 3300, 21],
  ['outdoors', 'Weatherproof Match Case', 'weatherproof-match-case', 1800, 40],
  ['travel', 'Weekender Duffel', 'weekender-duffel', 12800, 7],
  ['travel', 'Packing Cube Trio', 'packing-cube-trio', 5200, 18],
  ['travel', 'Leather Luggage Tag', 'leather-luggage-tag', 2600, 27],
  ['travel', 'Travel Wash Kit', 'travel-wash-kit', 5800, 15],
  ['travel', 'Foldaway Daypack', 'foldaway-daypack', 6400, 13],
  ['travel', 'Sleep Mask and Pouch', 'sleep-mask-and-pouch', 3000, 24],
];

const descriptions: Record<string, string> = {
  everyday: 'A quietly useful daily companion, refined for repeat use and made to age well.',
  home: 'A warm, tactile home essential chosen for honest materials and lasting character.',
  desk: 'A considered workspace tool that brings order and focus to the working day.',
  kitchen: 'A dependable kitchen staple with balanced proportions and food-safe finishes.',
  outdoors: 'A durable, packable companion for unhurried days beyond the front door.',
  travel: 'A lightweight travel essential that keeps the journey calm and organized.',
};

export const CATALOG: CatalogItem[] = products.map(([categorySlug, name, slug, priceMinor, stockQty], index) => {
  const details = categoryDetails[categorySlug];
  return {
    category: details.name,
    categorySlug,
    name,
    slug,
    description: descriptions[categorySlug],
    priceMinor,
    stockQty,
    material: details.material,
    dimensions: details.dimensions,
    care: details.care,
    featuredRank: index < 4 ? index + 1 : null,
    images: details.images,
  };
});
