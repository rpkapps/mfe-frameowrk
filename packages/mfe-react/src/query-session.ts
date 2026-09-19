import type { QueryClient } from '@tanstack/react-query';

/** Retire a mount-owned Query cache synchronously at a shell session boundary. */
export function retireQueryClientNow(queryClient: QueryClient): Promise<void> {
  const cancellation = queryClient.cancelQueries();
  for (const query of queryClient.getQueryCache().getAll()) query.reset();
  queryClient.removeQueries({ predicate: (query) => query.getObserversCount() === 0 });
  queryClient.getMutationCache().clear();
  return cancellation;
}
