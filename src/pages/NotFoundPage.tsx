import { Link } from "react-router";
import ButtonLink, { textLink } from "../components/ButtonLink";
import { Footer, Masthead, SkipLink, usePageTitle } from "../components/SiteLayout";

export default function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <>
      <SkipLink />
      <Masthead
        actions={
          <Link to="/login" className={textLink}>
            Sign in
          </Link>
        }
      />
      <main id="main" className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 pt-14 sm:px-6">
        <h1 className="max-w-[20ch] text-h1 md:text-h1-lg">Sorry, we can't find that page</h1>
        <p className="max-w-[52ch] text-lead text-muted">
          The address may be mistyped, or the page may have moved. The About Us page has links to everything else.
        </p>
        <ButtonLink to="/">Go to About Us</ButtonLink>
      </main>
      <Footer />
    </>
  );
}
