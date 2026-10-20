/** Lightweight map using OpenStreetMap's embed (no API key). Swap for a commercial map provider if traffic grows. */
export function MapEmbed({ lat, lng, title, zoomDelta = 0.008 }: { lat: number; lng: number; title: string; zoomDelta?: number }) {
  const bbox = [lng - zoomDelta, lat - zoomDelta * 0.6, lng + zoomDelta, lat + zoomDelta * 0.6].map((n) => n.toFixed(5)).join(',');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`;
  return <iframe className="aspect-[16/10] w-full rounded-[var(--r-md)] border-0 bg-[var(--leaf-3)]" src={src} title={title} loading="lazy" referrerPolicy="no-referrer" />;
}

export function directionsUrl(lat: number | null, lng: number | null, address?: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return null;
}
