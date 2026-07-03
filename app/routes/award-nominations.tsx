import { Link } from "react-router";
import type { Route } from "./+types/award-nominations";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Award nominations") },
    {
      name: "description",
      content:
        "Eligibility, application packages, and the nomination process for the Texas Branch ASM awards.",
    },
  ];
}

export default function AwardNominations() {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Award nominations
        </h1>
        <p className="max-w-2xl text-text-muted">
          Applications are due August 1 and are sent electronically as PDF files
          to the President of the ASM Texas Branch. The eligibility rules,
          application packages, and conditions for each award are below.
        </p>
      </header>

      <section
        aria-labelledby="graduate-award-heading"
        className="space-y-5"
      >
        <div className="space-y-2">
          <h2
            id="graduate-award-heading"
            className="text-2xl font-semibold text-text"
          >
            Eugene and Millicent Goldschmidt Graduate Student Award
          </h2>
          <p className="max-w-2xl text-text-muted">
            For female graduate students studying microorganisms in their thesis
            research. This career development award provides $3,000 to $6,500 for
            doctoral students and $2,000 to $3,500 for master's students.
            Recipients are announced by August 31.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-text">Eligibility</h3>
          <p className="max-w-2xl text-text-muted">
            Applicants must be:
          </p>
          <ol className="max-w-2xl list-decimal space-y-2 pl-6 text-text-muted">
            <li>
              Female, a U.S. citizen or permanent resident, and not a previous
              recipient.
            </li>
            <li>
              A member of ASM and the Texas Branch ASM. Membership is available
              at{" "}
              <a
                href="https://asm.org"
                target="_blank"
                rel="noreferrer"
                className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                asm.org
              </a>
              .
            </li>
            <li>Able to show potential for a career in microbiology.</li>
            <li>
              Currently enrolled in an M.S. or Ph.D. program, not have defended
              the thesis at the time of application, and not expecting to
              graduate before May of the next year.
            </li>
          </ol>
          <p className="max-w-2xl text-text-muted">
            Per ASM definitions, microorganisms include bacteria, viruses,
            protozoa, and fungi.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-text">
            Application package
          </h3>
          <ul className="max-w-2xl list-disc space-y-2 pl-6 text-text-muted">
            <li>A cover letter.</li>
            <li>A curriculum vitae.</li>
            <li>Electronic reprints of publications, if applicable.</li>
            <li>
              A description of current thesis research, up to two pages.
            </li>
            <li>A statement of career plans, one half page.</li>
            <li>
              If the plan is to visit a laboratory, a permission letter from
              that laboratory.
            </li>
            <li>
              If the plan is to attend a meeting or course, a link to the online
              information.
            </li>
            <li>
              Plans for the use of funds, with an itemized budget and timeline,
              one page.
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-text">Use of funds</h3>
          <p className="max-w-2xl text-text-muted">
            Funds may be used for travel to a conference, to visit another
            laboratory, travel and tuition for a course or workshop in a
            geographically distant place, and other career-advancing travel.
          </p>
          <p className="max-w-2xl text-text-muted">
            Funds may not be used for publication costs, research materials, or
            tuition to the applicant's own university.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-text">
            Letters of support
          </h3>
          <p className="max-w-2xl text-text-muted">
            At least two letters of support are sent separately to the
            President. One must be from the current thesis advisor.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-text">Conditions</h3>
          <ul className="max-w-2xl list-disc space-y-2 pl-6 text-text-muted">
            <li>The award is paid in two installments.</li>
            <li>A six-month progress report and a final report are required.</li>
            <li>
              The second installment is contingent on a satisfactory progress
              report.
            </li>
            <li>
              The recipient must present her work at a Texas Branch meeting, Fall
              or Spring, within one year.
            </li>
            <li>
              Applicants are encouraged to include up to $750 for meeting travel,
              registration, and lodging in the budget.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="faculty-award-heading" className="space-y-5">
        <div className="space-y-2">
          <h2
            id="faculty-award-heading"
            className="text-2xl font-semibold text-text"
          >
            Eugene and Millicent Goldschmidt Faculty Education and Mentoring
            Awards
          </h2>
          <p className="max-w-2xl text-text-muted">
            Two faculty awards of $1,000 each are given per academic year: one
            for excellence in education and one for excellence in mentoring.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-text">
            Mentoring Award package
          </h3>
          <ol className="max-w-2xl list-decimal space-y-2 pl-6 text-text-muted">
            <li>
              A nomination letter from a faculty member. Self-nominations are not
              accepted.
            </li>
            <li>
              One to three letters of support from previous or current mentees.
            </li>
            <li>
              A curriculum vitae including a statement on mentoring activities and
              information about previous mentees, such as degrees earned, current
              location, and accomplishments, up to five pages.
            </li>
          </ol>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-text">
            Teaching Award package
          </h3>
          <ol className="max-w-2xl list-decimal space-y-2 pl-6 text-text-muted">
            <li>
              A nomination letter from a faculty member. Self-nominations are not
              accepted.
            </li>
            <li>A curriculum vitae.</li>
            <li>
              A letter from the nominee with teaching experience and teaching
              philosophy.
            </li>
            <li>
              Examples of educational materials, such as syllabi, assignments,
              and assessments, up to three pages.
            </li>
          </ol>
        </div>

        <p className="max-w-2xl text-text-muted">
          All nominees must be faculty at a Texas institution of higher learning
          involved in microbiology research or teaching. National ASM and branch
          membership are required.
        </p>
      </section>

      <p className="text-sm text-text-muted">
        Browse the{" "}
        <Link
          to="/awards"
          className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          full list of awards
        </Link>{" "}
        to see which fits your work.
      </p>
    </div>
  );
}
