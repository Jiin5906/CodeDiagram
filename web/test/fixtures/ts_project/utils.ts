// TypeScript utility functions with generics and type guards

type Predicate<T> = (item: T) => boolean;

function filterItems<T>(items: T[], predicate: Predicate<T>): T[] {
  return items.filter(predicate);
}

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

async function retry<T>(fn: () => Promise<T>, maxAttempts: number = 3): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError;
}

const debounce = <T extends (...args: unknown[]) => void>(fn: T, delay: number): T => {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
};

export { filterItems, groupBy, retry, debounce };
