import { utils } from 'vim_comic_viewer';
import '../tampermonkey.d.ts';

const timedOut = Symbol();
const retry = async <T>(
  worker: () => Promise<T>,
  {
    onTimeout,
    onError,
    initialInterval,
    retryCount,
  }: {
    onTimeout?: (count: number) => void | Promise<void>;
    onError?: (count: number) => void | Promise<void>;
    initialInterval?: number;
    retryCount?: number;
  } = {},
): Promise<T> => {
  const count = retryCount || 3;
  let interval = initialInterval || 2000;
  let i = 0;
  while (true) {
    const timer = async () => {
      await utils.timeout(interval || 0);
      return timedOut;
    };

    try {
      let result = await Promise.race([worker(), timer()]);
      if (result !== timedOut) {
        return result as T;
      }
      await onTimeout?.(++i);
    } catch (error) {
      await onError?.(++i);
    }

    if (count < i) {
      throw new Error(`${count} retries failed`);
    }
    interval *= 1.5;
  }
};

const originalFetch = unsafeWindow.fetch.bind(unsafeWindow);

export const retrialFetch = (resource: string, init?: RequestInit) => {
  const isImg = resource.match(/\.(jpe?g|webp|png|gif|avif)$/i);
  let aborter: AbortController;
  let response: Response;
  const worker = async () => {
    aborter = new AbortController();
    response = await originalFetch(resource, { ...init, signal: aborter.signal });
    const data = await (isImg ? response.blob() : response.json());
    return { blob: () => data, json: () => data };
  };
  return retry(worker, {
    onTimeout: (count) => {
      aborter.abort();
      console.log(`[timeout:${count}] ${resource}`);
    },
    onError: (count) => {
      console.log(`[timeout:${count}] ${resource}`);
    },
    initialInterval: isImg ? 5000 : 2000,
  });
};

export const hookFetch = () => {
  const fetchOverride = (async (
    resource: RequestInfo,
    init: RequestInit,
  ): Promise<Response> => {
    if (init?.body === undefined) {
      delete (init?.headers as any)?.['Content-Type'];
    }
    if (
      typeof resource === 'string' &&
      resource.match(/^https:\/\/(api|cdn)\.hiyobi\.me\//)
    ) {
      return retrialFetch(resource, init) as any;
    } else {
      return originalFetch(resource, init);
    }
  }) as any;

  unsafeWindow.fetch = exportFunction(fetchOverride, unsafeWindow);
};
