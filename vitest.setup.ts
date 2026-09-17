import "@testing-library/jest-dom/vitest";
import "@vitest/web-worker";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(cleanup);
