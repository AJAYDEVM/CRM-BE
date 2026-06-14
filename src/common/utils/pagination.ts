export function parsePagination(page?: number, limit?: number) {
  const parsedPage = Math.max(1, page ?? 1);
  const parsedLimit = Math.min(100, Math.max(1, limit ?? 10));
  return {
    page: parsedPage,
    limit: parsedLimit,
    skip: (parsedPage - 1) * parsedLimit,
  };
}

export function paginatedResult<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
