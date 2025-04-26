import { getSession } from "@/lib/auth";

export default async function Page() {
  const session = await getSession();

  const user = session?.user;

  return user ? (
    <div>
      <div className="prose dsy-prose mb-8">
        <h2>Profile</h2>
      </div>

      <form className="flex flex-col gap-4">
        <div className="dsy-form-control w-full">
          <label className="dsy-label" htmlFor="name">
            <span className="dsy-label-text capitalize">Name</span>
          </label>
          <input
            className="dsy-input dsy-input-bordered"
            defaultValue={user.name}
            disabled
            id="name"
            name="name"
            type="text"
          />
        </div>
        <div className="dsy-form-control w-full">
          <label className="dsy-label" htmlFor="email">
            <span className="dsy-label-text capitalize">Email</span>
          </label>
          <input
            className="dsy-input dsy-input-bordered"
            defaultValue={user.email}
            disabled
            id="email"
            name="email"
            type="text"
          />
        </div>
        <div className="flex justify-end sm:justify-start">
          <button className="dsy-btn dsy-btn-accent" disabled type="submit">
            Save
          </button>
        </div>
      </form>
    </div>
  ) : null;
}
