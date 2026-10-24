import ButtonLink from "../components/ButtonLink";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-extrabold">Sorry, we can't find that page</h1>
      <p className="text-xl text-muted">The page may have moved. Let's take you back to the start.</p>
      <ButtonLink to="/">Go to the homepage</ButtonLink>
    </main>
  );
}
