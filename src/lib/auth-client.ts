import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";
import { toast } from "sonner";

export const authClient = createAuthClient({
  fetchOptions: {
    onError: () => {
      toast.error("Something went wrong. Please try again.");
    },
  },
  plugins: [magicLinkClient()],
});
