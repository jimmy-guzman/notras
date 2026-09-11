import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, onTestFinished, vi } from "vitest";
import { NoteTags } from "@/components/notes/note-tags";

it("should keep attached tags and typed choices available while suggestions load", async () => {
  const listed = Promise.withResolvers<[]>();
  mockIPC((command) => {
    if (command === "list_tags") {
      return listed.promise;
    }
    throw new Error(`unexpected command: ${command}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  onTestFinished(async () => {
    await act(() => {
      listed.resolve([]);
    });
    client.clear();
    clearMocks();
  });
  const onFilter = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <NoteTags onFilter={onFilter} path="a.md" tags={["attached"]} />
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "#attached" })).toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "add tag" }));
  expect(
    await screen.findByText("loading tag suggestions...")
  ).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText("filter tags..."), "newtag");
  expect(screen.getByRole("option", { name: "newtag" })).toBeInTheDocument();
  expect(screen.queryByText("no tags yet")).not.toBeInTheDocument();
});
