import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getAuthor } from "@/lib/uploads.server"

const loadAuthor = createServerFn({ method: "GET" }).handler(() => getAuthor())

export const Route = createFileRoute("/")({
  loader: () => loadAuthor(),
  component: HomePage,
})

function HomePage() {
  const author = Route.useLoaderData()

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center bg-neutral-100">
      <div className="flex flex-col items-center gap-4">
        <img
          src={author.avatar}
          className="size-14 rounded-full"
          alt={author.name}
        />
        <div className="text-center">
          <h1 className="text-xl font-semibold text-neutral-900">
            Screendrop Cloud
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Screenshot sharing by {author.name}
          </p>
        </div>
      </div>
    </main>
  )
}
