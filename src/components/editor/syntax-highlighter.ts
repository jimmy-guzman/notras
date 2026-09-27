import { bundledLanguagesInfo } from "shiki/langs";

/** One colored run inside a line; `offset` counts from the line start. */
export interface SyntaxToken {
  color: string;
  length: number;
  offset: number;
}

export interface SyntaxRequest {
  code: string;
  /** The block being tokenized, so the worker can diff against its last text. */
  document: number;
  id: number;
  language: string;
}

/**
 * A block's code plus what decides when the worker sees it. `distance` and
 * `showing` are read when the next request is picked, so the caller keeps
 * them current while the job waits.
 */
export interface SyntaxJob {
  code: string;
  /** Characters between the block and what is on screen, zero when it reaches into it. */
  distance: number;
  /** The block being tokenized, so the worker can diff against its last text. */
  document: number;
  /** An edit asked, rather than a mount. */
  edited: boolean;
  language: string;
  /** The editor holding the block is painted. */
  showing: boolean;
  /** Aborting withdraws the job while it waits; one in flight still answers. */
  signal: AbortSignal;
}

/** Replace the lines from `start` up to the last `tail` lines with `lines`. */
export interface SyntaxSplice {
  lines: SyntaxToken[][];
  start: number;
  tail: number;
}

export type SyntaxResponse =
  | { error: string; id: number }
  | ({ id: number } & SyntaxSplice);

interface Waiting {
  arrived: number;
  job: SyntaxJob;
  resolvers: PromiseWithResolvers<SyntaxSplice | undefined>;
}

let worker: Worker | undefined;
let nextId = 0;
let arrivals = 0;
/** One job per block, keyed by the block's id. */
const waiting = new Map<number, Waiting>();
let inFlight: Waiting | undefined;

/** Negative when `a` goes first: a showing editor, then an edit, then the block nearest its screen, then the earliest arrival. */
function compare(a: Waiting, b: Waiting) {
  return (
    Number(b.job.showing) - Number(a.job.showing) ||
    Number(b.job.edited) - Number(a.job.edited) ||
    a.job.distance - b.job.distance ||
    a.arrived - b.arrived
  );
}

function fail(reason: string) {
  const failed = [inFlight, ...waiting.values()];
  inFlight = undefined;
  waiting.clear();
  for (const each of failed) {
    each?.resolvers.reject(new Error(reason));
  }
}

function settle(response: SyntaxResponse) {
  if (inFlight === undefined || response.id !== nextId) {
    throw new Error("The worker answered a request nobody made");
  }
  const { resolvers } = inFlight;
  inFlight = undefined;
  if ("error" in response) {
    resolvers.reject(new Error(response.error));
  } else {
    resolvers.resolve(response);
  }
}

/** Take the best waiting job off the queue; aborted jobs leave it on the way. */
function takeNext() {
  let next: Waiting | undefined;
  for (const [document, candidate] of waiting) {
    if (candidate.job.signal.aborted) {
      waiting.delete(document);
      candidate.resolvers.resolve(undefined);
    } else if (next === undefined || compare(candidate, next) < 0) {
      next = candidate;
    }
  }
  if (next !== undefined) {
    waiting.delete(next.job.document);
  }
  return next;
}

/** Post the best waiting job, unless one is in flight. */
function post() {
  if (inFlight !== undefined) {
    return;
  }
  const next = takeNext();
  if (next === undefined) {
    return;
  }
  nextId += 1;
  inFlight = next;
  if (worker === undefined) {
    const instance = new Worker(new URL("syntax-worker.ts", import.meta.url), {
      type: "module",
    });
    instance.addEventListener(
      "message",
      (event: MessageEvent<SyntaxResponse>) => {
        settle(event.data);
        post();
      }
    );
    // A worker that cannot start answers nothing, so its requests fail here
    // and the next request starts a fresh one.
    instance.addEventListener("error", (event) => {
      instance.terminate();
      worker = undefined;
      fail(event.message);
    });
    worker = instance;
  }
  const { code, document, language } = next.job;
  const request: SyntaxRequest = { code, document, id: nextId, language };
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's second argument is a transfer list, not an origin
  worker.postMessage(request);
}

export const codeLanguages = bundledLanguagesInfo.map(({ id }) => id);

/** Resolve an explicit fence label without changing what is saved to the file. */
export function syntaxLanguage(
  language: string | null | undefined
): string | undefined {
  if (language === null || language === undefined) {
    return undefined;
  }

  const label = language.toLowerCase();

  return bundledLanguagesInfo.find(
    ({ aliases, id }) => id === label || aliases?.includes(label) === true
  )?.id;
}

/**
 * Tokenize code off the UI thread, one block at a time in the order the jobs
 * rank; grammars are packaged, so no network service receives code. Resolves
 * with nothing when a later job for the same block replaced this one, or its
 * signal aborted, before it was posted.
 */
export async function highlightCode(
  job: SyntaxJob
): Promise<SyntaxSplice | undefined> {
  const resolvers = Promise.withResolvers<SyntaxSplice | undefined>();
  waiting.get(job.document)?.resolvers.resolve(undefined);
  arrivals += 1;
  waiting.set(job.document, { arrived: arrivals, job, resolvers });
  // A frame or an edit enqueues a batch synchronously; the pick waits for all of it.
  queueMicrotask(post);

  return await resolvers.promise;
}
