import { Link } from "react-router";
import { textLink } from "../components/ButtonLink";
import { Footer, Masthead, SkipLink, usePageTitle } from "../components/SiteLayout";

// The photos on the site are by Shixart1985 on Wikimedia Commons, under the
// Creative Commons Attribution 2.0 licence, which asks for this credit.
// The files themselves are in public/photos/.
const LICENCE = "https://creativecommons.org/licenses/by/2.0/";

const photos = [
  {
    file: "kitchen-woman-vegetables.jpg",
    title: "Elderly woman prepares vegetables while cooking in a home kitchen during the day",
    source: "https://commons.wikimedia.org/wiki/File:Elderly_woman_prepares_vegetables_while_cooking_in_a_home_kitchen_during_the_day.jpg",
    usedOn: "About Us, at the top",
  },
  {
    file: "woman-telephone-margaret.jpg",
    title: "Senior woman engaged in conversation on an old-fashioned telephone",
    source: "https://commons.wikimedia.org/wiki/File:Senior_woman_engaged_in_conversation_on_an_old-fashioned_telephone.jpg",
    usedOn: "About Us, “What happens when an alert goes off”",
  },
  {
    file: "man-with-cat.jpg",
    title: "Elderly man holding a cat closeup",
    source: "https://commons.wikimedia.org/wiki/File:Elderly_man_holding_a_cat_closeup.jpg",
    usedOn: "About Us, “Who we are”",
  },
  {
    file: "couple-reading.jpg",
    title: "Elderly couple reading a book together at home",
    source: "https://commons.wikimedia.org/wiki/File:Elderly_couple_reading_a_book_together_at_home.jpg",
    usedOn: "About Us, “Who we are”",
  },
  {
    file: "woman-window-phone.jpg",
    title: "Elderly woman standing next to a window and looking at her phone",
    source: "https://commons.wikimedia.org/wiki/File:Elderly_woman_standing_next_to_a_window_and_looking_at_her_phone.jpg",
    usedOn: "Sign in (on wider screens)",
  },
];

export default function PhotoCreditsPage() {
  usePageTitle("Photo credits");
  return (
    <>
      <SkipLink />
      <Masthead
        actions={
          <Link to="/" className={textLink}>
            About CareNest
          </Link>
        }
      />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <h1 className="text-h1 md:text-h1-lg">Photo credits</h1>
        <p className="mt-4 max-w-[62ch] text-lead text-muted">
          The photos on this website are by Shixart1985, from Wikimedia Commons, used under the{" "}
          <a href={LICENCE}>
            Creative Commons Attribution 2.0 licence
          </a>
          . We made smaller copies of them so the pages load faster. The people in them are not our team or our users.
        </p>
        <ol className="mt-10 border-t border-rule">
          {photos.map((p) => (
            <li key={p.file} className="grid gap-4 border-b border-rule py-6 sm:grid-cols-12">
              <img
                src={`/photos/${p.file}`}
                alt=""
                loading="lazy"
                width={240}
                height={160}
                className="aspect-[3/2] w-full max-w-60 object-cover sm:col-span-3"
              />
              <div className="sm:col-span-9">
                <p className="font-serif text-h3 font-semibold">{p.title}</p>
                <p className="mt-1 text-muted">Used on: {p.usedOn}</p>
                <p className="mt-1">
                  By Shixart1985, <a href={LICENCE}>CC BY 2.0</a>. <a href={p.source}>See the original on Wikimedia Commons</a>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </main>
      <Footer />
    </>
  );
}
