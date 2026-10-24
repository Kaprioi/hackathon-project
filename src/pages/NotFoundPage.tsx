import ButtonLink from "../components/ButtonLink";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-4 sm:px-6 text-center">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Sorry, we can't find that page</h1>
      <p className="text-xl text-muted">The page may have moved. Let's take you back to the start.</p>
      <ButtonLink to="/">Go to the homepage</ButtonLink>
    </main>
  );
}
