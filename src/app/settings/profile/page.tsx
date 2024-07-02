import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getUserByUserId } from "@/lib/get-user-by-user-id";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { selectUserSchema, users } from "@/server/db/schemas/users";

const schema = selectUserSchema.pick({ theme: true });

export default async function Page() {
  const session = await auth();

  const userId = session?.user?.id;

  const user = userId ? await getUserByUserId(userId) : null;

  return userId ? (
    <div>
      <div className="prose dsy-prose mb-8">
        <h2>Profile</h2>
      </div>

      <form
        className="flex flex-col gap-4"
        action={async (formData) => {
          "use server";

          const values = schema.parse({ theme: formData.get("theme") });

          await db.update(users).set(values).where(eq(users.id, userId));

          revalidatePath("/", "layout");
        }}
      >
        <div className="dsy-form-control w-full">
          <label className="dsy-label" htmlFor="name">
            <span className="dsy-label-text capitalize">Name</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            className="dsy-input dsy-input-bordered"
            defaultValue={user?.name ?? ""}
            disabled
          />
        </div>
        <div className="dsy-form-control w-full">
          <label className="dsy-label" htmlFor="email">
            <span className="dsy-label-text capitalize">Email</span>
          </label>
          <input
            type="text"
            id="email"
            name="email"
            className="dsy-input dsy-input-bordered"
            defaultValue={user?.email}
            disabled
          />
        </div>
        <div className="flex justify-end sm:justify-start">
          <button type="submit" className="dsy-btn dsy-btn-accent" disabled>
            Save
          </button>
        </div>
      </form>
    </div>
  ) : null;
}
