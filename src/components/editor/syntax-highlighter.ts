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

/** Replace the lines from `start` up to the last `tail` lines with `lines`. */
export interface SyntaxSplice {
  lines: SyntaxToken[][];
  start: number;
  tail: number;
}

export type SyntaxResponse =
  | { error: string; id: number }
  | ({ id: number } & SyntaxSplice);

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, PromiseWithResolvers<SyntaxSplice>>();

function settle(response: SyntaxResponse) {
  const request = pending.get(response.id);
  pending.delete(response.id);
  if ("error" in response) {
    request?.reject(new Error(response.error));
  } else {
    request?.resolve(response);
  }
}

function syntaxWorker() {
  if (worker === undefined) {
    const instance = new Worker(new URL("syntax-worker.ts", import.meta.url), {
      type: "module",
    });
    instance.addEventListener(
      "message",
      (event: MessageEvent<SyntaxResponse>) => {
        settle(event.data);
      }
    );
    // A worker that cannot start answers nothing, so its requests fail here
    // and the next request starts a fresh one.
    instance.addEventListener("error", (event) => {
      instance.terminate();
      worker = undefined;
      for (const [id] of pending) {
        settle({ error: event.message, id });
      }
    });
    worker = instance;
  }

  return worker;
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

/** Tokenize code off the UI thread; grammars are packaged, so no network service receives code. */
export async function highlightCode(
  code: string,
  language: string,
  document: number
): Promise<SyntaxSplice> {
  const resolvers = Promise.withResolvers<SyntaxSplice>();
  nextId += 1;
  pending.set(nextId, resolvers);
  const request: SyntaxRequest = { code, document, id: nextId, language };
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's second argument is a transfer list, not an origin
  syntaxWorker().postMessage(request);

  return await resolvers.promise;
}
