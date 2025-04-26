"use client";

import { signinGithub } from "@/lib/auth-social";

export const SignInlButton = () => {
  return (
    <button
      className="dsy-btn dsy-btn-accent"
      onClick={signinGithub}
      type="button"
    >
      Continue with GitHub{" "}
      <span className="icon-[simple-icons--github] h-4 w-4" />
    </button>
  );
};
