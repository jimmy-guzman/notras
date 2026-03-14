export const openapi = {
  info: {
    description: `REST API for notras.

## Resources

- [Notras](/)
- [API LLM Documentation](/api/llms.txt)
- [OpenAPI JSON](/api/openapi.json)`,
    title: "notras API",
    version: "0.0.0",
  },
  version: "3.1.1",
} satisfies {
  info: { description: string; title: string; version: string };
  version: string;
};
