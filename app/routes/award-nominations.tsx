import { Link } from "react-router";
import type { Route } from "./+types/award-nominations";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Award Nominations") },
    {
      name: "description",
      content:
        "Award nominations for the Texas Branch of the American Society for Microbiology: recognizing faculty and students.",
    },
  ];
}

const prose = "text-text-muted";

export default function AwardNominations() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Award Nominations
        </h1>
        <p className={prose}>Recognizing Faculty and Students</p>
        <p className={prose}>Deadline: August 1</p>
        <p className={prose}>
          Application Process: Applications must be sent electronically as PDF
          files to the{" "}
          <Link
            to="/branch-officers"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            President of the ASM Texas Branch
          </Link>
          .
        </p>
      </header>

      <section aria-labelledby="graduate-award-heading" className="space-y-5">
        <h2
          id="graduate-award-heading"
          className="text-2xl font-semibold text-text"
        >
          Eugene and Millicent Goldschmidt Graduate Student Award
        </h2>

        <p className={prose}>
          The Texas Branch of the American Society for Microbiology announces the
          Eugene and Millicent Goldschmidt Graduate Student Award for female
          graduate students studying microorganisms in their thesis research.
          This career development award will be awarded between $3,000 and $6,500
          for doctoral students and between $2,000 and $3,500 for master's
          students. The awards will be announced by August 31.
        </p>

        <p className={prose}>Award applicants must be:</p>
        <ol className="list-decimal space-y-2 pl-6 text-text-muted">
          <li>
            Female, U.S. citizen or permanent resident, and not a previous
            recipient of the award
          </li>
          <li>
            Member of the American Society for Microbiology and the Texas Branch
            - American Society for Microbiology. Applicants can join both the
            national ASM and Texas Branch ASM at{" "}
            <a
              href="http://www.asm.org/index.php/membership/join-asm.html"
              target="_blank"
              rel="noreferrer"
              className="break-words text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              http://www.asm.org/index.php/membership/join-asm.html
            </a>
          </li>
          <li>Show potential for a career in microbiology</li>
          <li>
            Currently enrolled in an M.S. or Ph.D. program, not defended their
            thesis at the time of application, and not expecting to graduate
            before May the next year
          </li>
        </ol>

        <p className={prose}>
          {'Per ASM definitions, "microorganisms" include bacteria, viruses, protozoa, and fungi.'}
        </p>

        <p className={prose}>The application package must include:</p>
        <ul className="list-disc space-y-2 pl-6 text-text-muted">
          <li>Cover letter</li>
          <li>CV of the applicant</li>
          <li>Electronic reprints of publications (if applicable)</li>
          <li>Description of current thesis research (up to 2 pages)</li>
          <li>Career plans (1/2 page)</li>
          <li>
            If planning to visit a lab, include a letter from the laboratory
            indicating that the proposed visit is permissible.
          </li>
          <li>
            If planning to attend a meeting or course, the candidate must provide
            a link to online information about the conference/course.
          </li>
          <li>
            Plans for use of the award funds to enhance your research and career.
            An itemized budget and timeline for utilizing the funds must be
            included. (1 page).
          </li>
        </ul>

        <p className={prose}>
          The award can be used for the following purposes: travel to a
          conference, travel to visit another laboratory, travel and tuition for
          a course or workshop in a geographically distant place, and other
          travel to advance the applicant's career. The award cannot be used for
          publication costs, research materials, or tuition to the applicant's
          university. Please contact the branch well before the application
          deadline if you have questions about how funds can be used.
        </p>

        <p className={prose}>
          At least two letters of support must be sent separately from the
          application directly to the President of the ASM Texas Branch. One of
          these letters must be from the applicant's current thesis advisor.
        </p>

        <h3 className="text-lg font-semibold text-text">Award Conditions</h3>
        <p className={prose}>
          The recipient will receive the award in two installments and will be
          required to submit a six-month progress report and final report to the
          Texas Branch ASM President. Receipt of the second installment is
          contingent upon receipt of a satisfactory progress report. In addition,
          the recipient will be required to make a scientific presentation of her
          work at one of the Texas Branch ASM Meetings within one year of
          receiving the award, at either the Fall or Spring Texas Branch meeting.
          It is recommended to include estimated cost of travel, registration,
          and lodging to a branch meeting (up to $750) in the award budget.
        </p>
      </section>

      <section aria-labelledby="faculty-award-heading" className="space-y-5">
        <h2
          id="faculty-award-heading"
          className="text-2xl font-semibold text-text"
        >
          Eugene and Millicent Goldschmidt Faculty Education and Mentoring Awards
        </h2>

        <p className={prose}>
          The Texas Branch of the American Society for Microbiology announces two
          faculty awards. One award of $1,000 in the area of excellence in
          education and one award of $1,000 in the area of excellence in
          mentoring will be given for the academic year.
        </p>

        <p className={prose}>The application package must include:</p>

        <h3 className="text-lg font-semibold text-text">Mentoring Award</h3>
        <ol className="list-decimal space-y-2 pl-6 text-text-muted">
          <li>Letter of nomination from a faculty member (no self-nominations)</li>
          <li>
            At least one (but no more than 3) letters of support from previous or
            current mentees
          </li>
          <li>
            CV of the nominee, including a statement describing mentoring
            activities and listing information about previous mentees (e.g.,
            degrees earned, current location, accomplishments), should be no more
            than five pages
          </li>
        </ol>

        <h3 className="text-lg font-semibold text-text">Teaching Award</h3>
        <ol className="list-decimal space-y-2 pl-6 text-text-muted">
          <li>Letter of nomination from a faculty member (no self-nominations)</li>
          <li>CV of nominee</li>
          <li>
            Letter from the nominee that includes a description of teaching
            experience and a statement of teaching philosophy
          </li>
          <li>
            Include examples of educational materials (e.g., syllabi, assignments,
            assessments), limited to three pages
          </li>
        </ol>

        <p className={prose}>
          All nominees should be faculty members of a Texas Institution for
          Higher Learning and involved in microbiology research or teaching.
          National ASM and branch membership are also required.
        </p>
      </section>
    </div>
  );
}
