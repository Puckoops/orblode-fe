import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PAGES_SIZE, fetchAllPages, type PageResult } from "../paging.ts";

function server(rows: number[], opts: { total?: number } = {}) {
  const calls: { page: number; pageSize: number }[] = [];
  const fetchPage = async (page: number, pageSize: number): Promise<PageResult<number>> => {
    calls.push({ page, pageSize });
    return { items: rows.slice(page * pageSize, (page + 1) * pageSize), total: opts.total ?? rows.length };
  };
  return { calls, fetchPage };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

test("an empty list takes one request and yields nothing", async () => {
  const s = server([]);
  assert.deepEqual(await fetchAllPages(s.fetchPage), []);
  assert.deepEqual(s.calls, [{ page: 0, pageSize: ALL_PAGES_SIZE }]);
});

test("a list that fits one page takes one request", async () => {
  const s = server(range(7));
  assert.deepEqual(await fetchAllPages(s.fetchPage), range(7));
  assert.equal(s.calls.length, 1);
});

test("several pages are fetched in order with page_size 100 until total is reached", async () => {
  const s = server(range(250));
  assert.deepEqual(await fetchAllPages(s.fetchPage), range(250));
  assert.deepEqual(
    s.calls.map((c) => [c.page, c.pageSize]),
    [
      [0, 100],
      [1, 100],
      [2, 100],
    ]
  );
});

test("a total that is an exact multiple of the page size never requests the page past the end", async () => {
  const s = server(range(200));
  assert.deepEqual(await fetchAllPages(s.fetchPage), range(200));
  assert.equal(s.calls.length, 2);
});

test("an empty page past the end stops the walk even when total still claims more rows", async () => {
  const s = server(range(120), { total: 180 });
  assert.deepEqual(await fetchAllPages(s.fetchPage), range(120));
  assert.deepEqual(
    s.calls.map((c) => c.page),
    [0, 1, 2]
  );
});

test("a null page of items counts as empty", async () => {
  const pages: PageResult<string>[] = [{ items: null, total: 0 }];
  assert.deepEqual(await fetchAllPages(async (page) => pages[page]), []);
});

test("a custom page size is passed through", async () => {
  const s = server(range(5));
  assert.deepEqual(await fetchAllPages(s.fetchPage, 2), range(5));
  assert.deepEqual(
    s.calls.map((c) => [c.page, c.pageSize]),
    [
      [0, 2],
      [1, 2],
      [2, 2],
    ]
  );
});
