export const PAGE_SIZE = 200;

export function totalPages(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
}

export function sliceFor<T>(items: T[], page: number): T[] {
  const start = (page - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

export function pageUrl(page: number): string {
  return page === 1 ? "/all/" : `/all/p/${page}/`;
}
