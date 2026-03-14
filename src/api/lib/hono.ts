import { OpenAPIHono, z } from "@hono/zod-openapi";

export const hono = () => {
  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            details: z.treeifyError(result.error),
            message: "your request did not match the expected schema.",
            status: 422,
          },
          422,
        );
      }

      return undefined;
    },
  });
};
