export type Page<T> = { items: T[]; page: number; pages: number; from: number; to: number; total: number };

/** Page `page` (0-based) of `all`, clamped into range. `from` and `to` are 1-based for display, 0 when empty. */
export function pageOf<T>(all: T[], page: number, size: number): Page<T> {
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, Math.trunc(page) || 0), pages - 1);
  const items = all.slice(p * size, (p + 1) * size);
  return { items, page: p, pages, from: items.length ? p * size + 1 : 0, to: p * size + items.length, total };
}
