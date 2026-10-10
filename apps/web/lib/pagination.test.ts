import { describe, expect, it } from "vitest";
import { pageOf } from "./pagination";

const list = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("pageOf", () => {
  it("returns the first page", () => {
    expect(pageOf(list(12), 0, 5)).toEqual({ items: [1, 2, 3, 4, 5], page: 0, pages: 3, from: 1, to: 5, total: 12 });
  });

  it("returns a middle page", () => {
    expect(pageOf(list(12), 1, 5)).toMatchObject({ items: [6, 7, 8, 9, 10], page: 1, from: 6, to: 10 });
  });

  it("returns a partial last page", () => {
    expect(pageOf(list(12), 2, 5)).toMatchObject({ items: [11, 12], page: 2, from: 11, to: 12 });
  });

  it("handles an exact multiple of the page size", () => {
    expect(pageOf(list(10), 1, 5)).toMatchObject({ pages: 2, from: 6, to: 10 });
  });

  it("handles an empty list", () => {
    expect(pageOf([], 0, 5)).toEqual({ items: [], page: 0, pages: 1, from: 0, to: 0, total: 0 });
  });

  it("clamps out-of-range and invalid pages", () => {
    expect(pageOf(list(7), 9, 5)).toMatchObject({ page: 1, items: [6, 7] });
    expect(pageOf(list(7), -3, 5)).toMatchObject({ page: 0, from: 1 });
    expect(pageOf(list(7), Number.NaN, 5)).toMatchObject({ page: 0 });
  });
});
