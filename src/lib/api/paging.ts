export const ALL_PAGES_SIZE = 100;

export interface PageResult<T> {
  items: T[] | null | undefined;
  total: number;
}

/** Every item of a paged list route, fetched page by page (zero-based) until `total` items have arrived. */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PageResult<T>>,
  pageSize = ALL_PAGES_SIZE
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; ; page++) {
    const { items, total } = await fetchPage(page, pageSize);
    const batch = items ?? [];
    all.push(...batch);
    // An empty page ends the walk even when `total` says otherwise: rows deleted mid-walk would loop it forever.
    if (batch.length === 0 || !Number.isFinite(total) || all.length >= total) return all;
  }
}
