import { links } from "@/constants/links";

export default function Page() {
  return (
    <div className="-mt-16 md:container md:mx-auto">
      <div className="dsy-hero min-h-screen">
        <div className="dsy-hero-content flex-col gap-8">
          <div className="flex gap-4">
            <span className="icon-[simple-icons--nextdotjs] text-5xl text-white md:text-7xl" />
            <span className="icon-[simple-icons--typescript] text-5xl text-[#3178C6] md:text-7xl" />
            <span className="icon-[simple-icons--tailwindcss] text-5xl text-[#06B6D4] md:text-7xl" />
            <span className="icon-[simple-icons--drizzle] text-5xl text-[#C5F74F] md:text-7xl" />
            <span className="icon-[simple-icons--turso] text-5xl text-[#4FF8D2] md:text-7xl" />
          </div>
          <div className="flex flex-col gap-4 text-center">
            <h1 className="inline bg-gradient-to-r from-primary to-secondary bg-clip-text pb-2 text-7xl font-bold text-transparent sm:text-8xl">
              Next.js Starter
            </h1>
            <p className="py-6">
              🍱 Another opinionated Next.js Starter using{" "}
              <a className="dsy-link" href={links.typescript} target="_blank">
                TypeScript
              </a>
              ,{" "}
              <a className="dsy-link" href={links.tailwindcss} target="_blank">
                Tailwind CSS
              </a>
              ,{" "}
              <a className="dsy-link" href={links.drizzle} target="_blank">
                Drizzle ORM
              </a>{" "}
              and{" "}
              <a className="dsy-link" href={links.turso} target="_blank">
                Turso
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
