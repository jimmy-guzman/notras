import { env } from "@/env";
import { formatDate } from "@/lib/utils/format";

const REPO_URL = "https://github.com/jimmy-guzman/notras";

export function getBuildInfo() {
  const buildTime = env.NEXT_PUBLIC_BUILD_TIME
    ? formatDate(new Date(env.NEXT_PUBLIC_BUILD_TIME))
    : undefined;
  const commitSha = env.NEXT_PUBLIC_COMMIT_SHA;
  const shortSha = commitSha?.slice(0, 7);
  const commitUrl = commitSha ? `${REPO_URL}/commit/${commitSha}` : undefined;

  return { buildTime, commitUrl, shortSha };
}
