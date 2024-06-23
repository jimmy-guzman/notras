import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { parse, pick } from "valibot";

import { ThemeOption } from "@/components/theme-option";
import { links } from "@/constants/links";
import { themes } from "@/constants/themes";
import { getUserByUserId } from "@/lib/get-user-by-user-id";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { selectUserSchema, users } from "@/server/db/schemas/users";

const schema = pick(selectUserSchema, ["theme"]);

export default async function Page() {
  const session = await auth();

  const userId = session?.user?.id;

  const user = userId ? await getUserByUserId(userId) : null;

  return userId ? (
    <div>
      <div className="prose dsy-prose mb-8">
        <h2>Choose Your Theme</h2>
        <p>
          Theming is powered by{" "}
          <a
            className="dsy-link"
            href={links.daisyUIThemes}
            target="_blank"
            rel="noreferrer"
          >
            daisyUI themes
          </a>
          .
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        action={async (formData) => {
          "use server";

          const values = parse(schema, { theme: formData.get("theme") });

          await db.update(users).set(values).where(eq(users.id, userId));

          revalidatePath("/", "layout");
        }}
      >
        {themes.map((theme) => {
          return (
            <ThemeOption key={theme} userTheme={user?.theme} theme={theme} />
          );
        })}
        <div className="flex justify-end sm:justify-start">
          <button type="submit" className="dsy-btn dsy-btn-accent">
            Save
          </button>
        </div>
      </form>
    </div>
  ) : null;
}
