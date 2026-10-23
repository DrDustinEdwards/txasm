CREATE TABLE `page` (
	`slug` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`html` text NOT NULL,
	`render_version` text NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `page_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`page_slug` text NOT NULL,
	`event` text NOT NULL,
	`change_id` text NOT NULL,
	`version` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_slug`) REFERENCES `page`(`slug`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_page_revision_page` ON `page_revision` (`page_slug`,`created_at`);--> statement-breakpoint
INSERT INTO `page` (`slug`, `source`, `title`, `description`, `html`, `render_version`, `published_at`, `created_at`, `updated_at`) VALUES ('home', '---
title: "Texas Branch ASM"
description: "The Texas Branch of the American Society for Microbiology. Meetings, abstracts, and member news."
---

We bring Texas microbiologists together twice a year to share research, mentor students, and recognize the best work in the field. Registration, abstract submission, and the meeting program all live here.

Details for the next meeting are on the way. Check back soon, or see the people who run the branch.
', 'Texas Branch ASM', 'The Texas Branch of the American Society for Microbiology. Meetings, abstracts, and member news.', '<p>We bring Texas microbiologists together twice a year to share research, mentor students, and recognize the best work in the field. Registration, abstract submission, and the meeting program all live here.</p>
<p>Details for the next meeting are on the way. Check back soon, or see the people who run the branch.</p>', '3', 1792713600000, 1792713600000, 1792713600000);--> statement-breakpoint
INSERT INTO `page` (`slug`, `source`, `title`, `description`, `html`, `render_version`, `published_at`, `created_at`, `updated_at`) VALUES ('award-nominations', '---
title: "Award Nominations"
description: "Award nominations for the Texas Branch of the American Society for Microbiology: recognizing faculty and students."
---

Recognizing Faculty and Students

Deadline: August 1

Application Process: Applications must be sent electronically as PDF files to the [President of the ASM Texas Branch](/branch-officers).

## Eugene and Millicent Goldschmidt Graduate Student Award

The Texas Branch of the American Society for Microbiology announces the Eugene and Millicent Goldschmidt Graduate Student Award for female graduate students studying microorganisms in their thesis research. This career development award will be awarded between \$3,000 and \$6,500 for doctoral students and between \$2,000 and \$3,500 for master''s students. The awards will be announced by August 31.

Award applicants must be:

1. Female, U.S. citizen or permanent resident, and not a previous recipient of the award
2. Member of the American Society for Microbiology and the Texas Branch - American Society for Microbiology. Applicants can join both the national ASM and Texas Branch ASM at <http://www.asm.org/index.php/membership/join-asm.html>
3. Show potential for a career in microbiology
4. Currently enrolled in an M.S. or Ph.D. program, not defended their thesis at the time of application, and not expecting to graduate before May the next year

Per ASM definitions, "microorganisms" include bacteria, viruses, protozoa, and fungi.

The application package must include:

- Cover letter
- CV of the applicant
- Electronic reprints of publications (if applicable)
- Description of current thesis research (up to 2 pages)
- Career plans (1/2 page)
- If planning to visit a lab, include a letter from the laboratory indicating that the proposed visit is permissible.
- If planning to attend a meeting or course, the candidate must provide a link to online information about the conference/course.
- Plans for use of the award funds to enhance your research and career. An itemized budget and timeline for utilizing the funds must be included. (1 page).

The award can be used for the following purposes: travel to a conference, travel to visit another laboratory, travel and tuition for a course or workshop in a geographically distant place, and other travel to advance the applicant''s career. The award cannot be used for publication costs, research materials, or tuition to the applicant''s university. Please contact the branch well before the application deadline if you have questions about how funds can be used.

At least two letters of support must be sent separately from the application directly to the President of the ASM Texas Branch. One of these letters must be from the applicant''s current thesis advisor.

### Award Conditions

The recipient will receive the award in two installments and will be required to submit a six-month progress report and final report to the Texas Branch ASM President. Receipt of the second installment is contingent upon receipt of a satisfactory progress report. In addition, the recipient will be required to make a scientific presentation of her work at one of the Texas Branch ASM Meetings within one year of receiving the award, at either the Fall or Spring Texas Branch meeting. It is recommended to include estimated cost of travel, registration, and lodging to a branch meeting (up to \$750) in the award budget.

## Eugene and Millicent Goldschmidt Faculty Education and Mentoring Awards

The Texas Branch of the American Society for Microbiology announces two faculty awards. One award of \$1,000 in the area of excellence in education and one award of \$1,000 in the area of excellence in mentoring will be given for the academic year.

The application package must include:

### Mentoring Award

1. Letter of nomination from a faculty member (no self-nominations)
2. At least one (but no more than 3) letters of support from previous or current mentees
3. CV of the nominee, including a statement describing mentoring activities and listing information about previous mentees (e.g., degrees earned, current location, accomplishments), should be no more than five pages

### Teaching Award

1. Letter of nomination from a faculty member (no self-nominations)
2. CV of nominee
3. Letter from the nominee that includes a description of teaching experience and a statement of teaching philosophy
4. Include examples of educational materials (e.g., syllabi, assignments, assessments), limited to three pages

All nominees should be faculty members of a Texas Institution for Higher Learning and involved in microbiology research or teaching. National ASM and branch membership are also required.
', 'Award Nominations', 'Award nominations for the Texas Branch of the American Society for Microbiology: recognizing faculty and students.', '<p>Recognizing Faculty and Students</p>
<p>Deadline: August 1</p>
<p>Application Process: Applications must be sent electronically as PDF files to the <a href="/branch-officers">President of the ASM Texas Branch</a>.</p>
<h2 id="eugene-and-millicent-goldschmidt-graduate-student-award">Eugene and Millicent Goldschmidt Graduate Student Award<a class="heading-anchor" aria-label="Link to section: Eugene and Millicent Goldschmidt Graduate Student Award" href="#eugene-and-millicent-goldschmidt-graduate-student-award">#</a></h2>
<p>The Texas Branch of the American Society for Microbiology announces the Eugene and Millicent Goldschmidt Graduate Student Award for female graduate students studying microorganisms in their thesis research. This career development award will be awarded between $3,000 and $6,500 for doctoral students and between $2,000 and $3,500 for master''s students. The awards will be announced by August 31.</p>
<p>Award applicants must be:</p>
<ol>
<li>Female, U.S. citizen or permanent resident, and not a previous recipient of the award</li>
<li>Member of the American Society for Microbiology and the Texas Branch - American Society for Microbiology. Applicants can join both the national ASM and Texas Branch ASM at <a href="http://www.asm.org/index.php/membership/join-asm.html">http://www.asm.org/index.php/membership/join-asm.html</a></li>
<li>Show potential for a career in microbiology</li>
<li>Currently enrolled in an M.S. or Ph.D. program, not defended their thesis at the time of application, and not expecting to graduate before May the next year</li>
</ol>
<p>Per ASM definitions, "microorganisms" include bacteria, viruses, protozoa, and fungi.</p>
<p>The application package must include:</p>
<ul>
<li>Cover letter</li>
<li>CV of the applicant</li>
<li>Electronic reprints of publications (if applicable)</li>
<li>Description of current thesis research (up to 2 pages)</li>
<li>Career plans (1/2 page)</li>
<li>If planning to visit a lab, include a letter from the laboratory indicating that the proposed visit is permissible.</li>
<li>If planning to attend a meeting or course, the candidate must provide a link to online information about the conference/course.</li>
<li>Plans for use of the award funds to enhance your research and career. An itemized budget and timeline for utilizing the funds must be included. (1 page).</li>
</ul>
<p>The award can be used for the following purposes: travel to a conference, travel to visit another laboratory, travel and tuition for a course or workshop in a geographically distant place, and other travel to advance the applicant''s career. The award cannot be used for publication costs, research materials, or tuition to the applicant''s university. Please contact the branch well before the application deadline if you have questions about how funds can be used.</p>
<p>At least two letters of support must be sent separately from the application directly to the President of the ASM Texas Branch. One of these letters must be from the applicant''s current thesis advisor.</p>
<h3 id="award-conditions">Award Conditions<a class="heading-anchor" aria-label="Link to section: Award Conditions" href="#award-conditions">#</a></h3>
<p>The recipient will receive the award in two installments and will be required to submit a six-month progress report and final report to the Texas Branch ASM President. Receipt of the second installment is contingent upon receipt of a satisfactory progress report. In addition, the recipient will be required to make a scientific presentation of her work at one of the Texas Branch ASM Meetings within one year of receiving the award, at either the Fall or Spring Texas Branch meeting. It is recommended to include estimated cost of travel, registration, and lodging to a branch meeting (up to $750) in the award budget.</p>
<h2 id="eugene-and-millicent-goldschmidt-faculty-education-and-mentoring-awards">Eugene and Millicent Goldschmidt Faculty Education and Mentoring Awards<a class="heading-anchor" aria-label="Link to section: Eugene and Millicent Goldschmidt Faculty Education and Mentoring Awards" href="#eugene-and-millicent-goldschmidt-faculty-education-and-mentoring-awards">#</a></h2>
<p>The Texas Branch of the American Society for Microbiology announces two faculty awards. One award of $1,000 in the area of excellence in education and one award of $1,000 in the area of excellence in mentoring will be given for the academic year.</p>
<p>The application package must include:</p>
<h3 id="mentoring-award">Mentoring Award<a class="heading-anchor" aria-label="Link to section: Mentoring Award" href="#mentoring-award">#</a></h3>
<ol>
<li>Letter of nomination from a faculty member (no self-nominations)</li>
<li>At least one (but no more than 3) letters of support from previous or current mentees</li>
<li>CV of the nominee, including a statement describing mentoring activities and listing information about previous mentees (e.g., degrees earned, current location, accomplishments), should be no more than five pages</li>
</ol>
<h3 id="teaching-award">Teaching Award<a class="heading-anchor" aria-label="Link to section: Teaching Award" href="#teaching-award">#</a></h3>
<ol>
<li>Letter of nomination from a faculty member (no self-nominations)</li>
<li>CV of nominee</li>
<li>Letter from the nominee that includes a description of teaching experience and a statement of teaching philosophy</li>
<li>Include examples of educational materials (e.g., syllabi, assignments, assessments), limited to three pages</li>
</ol>
<p>All nominees should be faculty members of a Texas Institution for Higher Learning and involved in microbiology research or teaching. National ASM and branch membership are also required.</p>', '3', 1792713600000, 1792713600000, 1792713600000);
