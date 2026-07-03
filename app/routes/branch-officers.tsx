import { useId, useRef, useState } from "react";
import type { Route } from "./+types/branch-officers";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Branch officers") },
    {
      name: "description",
      content:
        "Current officers, advisory board, and past officers of the Texas Branch of the American Society for Microbiology.",
    },
  ];
}

// One officer's record. Kept as a flat shape so a later pass can source this
// list from a person model without reworking the markup.
type Officer = {
  role: string;
  name: string;
  affiliation: string;
  location: string;
  phone?: string;
  email?: string;
};

// An advisory board member: name plus institution, no contact block.
type BoardMember = {
  name: string;
  institution: string;
};

// A past officer term: the years served, the name, and the institution as
// carried on the live page. name/term are optional because the live page has
// gaps (unlisted years, unknown dates); render a muted placeholder, never a
// fabricated value.
type PastOfficer = {
  term?: string;
  name?: string;
  institution?: string;
};

// A block of entries within a tab. Most tabs are a single unlabeled block; the
// Editor tab carries two labeled blocks (see the mapping note below).
type PastOfficerBlock = {
  label?: string;
  entries: PastOfficer[];
};

type PastOfficerTab = {
  id: string;
  label: string;
  blocks: PastOfficerBlock[];
};

// Current slate and advisory board from the live branch-officers page (source of
// truth), in the order the page lists them.
const OFFICERS: Officer[] = [
  {
    role: "President",
    name: "Natasha Kirienko",
    affiliation: "Department of BioSciences, Rice University",
    location: "Houston, TX 77251-1892",
    phone: "713-348-2581",
    email: "kirienko@rice.edu",
  },
  {
    role: "Councilor",
    name: "Heidi Kaplan",
    affiliation:
      "Department of Microbiology and Molecular Genetics, McGovern Medical School, University of Texas Health Science Center at Houston",
    location: "Houston, TX 77030",
    phone: "713-500-5448",
    email: "Heidi.B.Kaplan@uth.tmc.edu",
  },
  {
    role: "President-Elect",
    name: "James Masuoka",
    affiliation: "Department of Biology, Midwestern State University",
    location: "Wichita Falls, TX 76308",
    phone: "940-397-4181",
    email: "james.masuoka@msutexas.edu",
  },
  {
    role: "Secretary",
    name: "William Cody",
    affiliation: "Department of Biology, University of Dallas",
    location: "Irving, TX 75062",
    phone: "972-721-5192",
    email: "wcody@udallas.edu",
  },
  {
    role: "Treasurer",
    name: "Patricia Baynham",
    affiliation: "Department of Biology, St. Edward's University",
    location: "Austin, TX 78704",
    phone: "512-233-1675",
    email: "patricib@stedwards.edu",
  },
  {
    role: "Archivist",
    name: "Dustin Edwards",
    affiliation: "Department of Biological Sciences, Tarleton State University",
    location: "Stephenville, TX 76402",
    phone: "254-968-9153",
    email: "dcedwards@tarleton.edu",
  },
];

const ADVISORY_BOARD: BoardMember[] = [
  { name: "Lee Hughes", institution: "University of North Texas" },
  { name: "Madhusudan Choudhary", institution: "Sam Houston State University" },
  { name: "Robert McLean", institution: "Texas State University" },
  { name: "Kelli Palmer", institution: "University of Texas at Dallas" },
  {
    name: "Kendra Rumbaugh",
    institution: "Texas Tech University Health Science Center",
  },
  { name: "Ali Azghani", institution: "University of Texas at Tyler" },
  { name: "Todd Primm", institution: "Sam Houston State University" },
];

// Past Branch Officers, tabbed by role to match the live page. Tab order and
// labels follow the live site: President, Vice President, Secretary, Treasurer,
// Councilor, Editor. Entries are verbatim from the vault note; gaps stay blank.
const PAST_OFFICER_TABS: PastOfficerTab[] = [
  {
    id: "president",
    label: "President",
    blocks: [
      {
        entries: [
          {
            term: "2024-2025",
            name: "Gregory Frederick",
            institution:
              "American University of the Caribbean School of Medicine",
          },
          { term: "2022-2023", name: "Kelly Palmer", institution: "UT Dallas" },
          {
            term: "2019-2021",
            name: "Madhusudan Choudhary",
            institution: "Sam Houston State",
          },
          { term: "2017-2018", name: "Lee Hughes", institution: "UNT" },
          { term: "2015-2016", name: "Ali Azghani", institution: "UT Tyler" },
          {
            term: "2013-2014",
            name: "Kendra Rumbaugh",
            institution: "TTU Health Sciences Center",
          },
          {
            term: "2011-2012",
            name: "Todd Primm",
            institution: "Sam Houston State",
          },
          {
            term: "2009-2010",
            name: "Marvin Whiteley",
            institution: "UT Austin",
          },
          {
            term: "2007-2008",
            name: "Poonam Gulati",
            institution: "University of Houston-Downtown",
          },
          {
            term: "2005-2006",
            name: "Heidi Kaplan",
            institution: "UT Medical School at Houston",
          },
          {
            term: "2003-2004",
            name: "Robert McLean",
            institution: "Texas State",
          },
          {
            term: "2001-2002",
            name: "Karl Klose",
            institution: "UT HSC San Antonio",
          },
          { term: "1999-2000", name: "James Stewart", institution: "UT Tyler" },
          { term: "1997-1998", name: "Alfred G. Brown" },
          { term: "1995-1996" },
          {
            term: "1993-1994",
            name: "Mollie McBride",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1991-1992",
            name: "Mary Pat Moyer",
            institution: "UT HSC San Antonio",
          },
          { term: "1990-1991", name: "James Walker", institution: "UT Austin" },
          {
            term: "1988-1989",
            name: "Thomas Huber",
            institution: "Olin E. Teague Veterans' Medical Center",
          },
          {
            term: "1987-1988",
            name: "Charles Gauntt",
            institution: "UT HSC San Antonio",
          },
          {
            term: "1986-1987",
            name: "Rex Moyer",
            institution: "Trinity University",
          },
          { term: "1985-1986", name: "A. Stephen Kester", institution: "UNT" },
          { term: "1984-1985", name: "L. Joe Berry", institution: "UT Austin" },
          {
            term: "1983-1984",
            name: "David N. McMurray",
            institution: "Texas A&M College Station",
          },
          {
            term: "1982-1983",
            name: "William C. McDonald",
            institution: "UT Arlington",
          },
          {
            term: "1981-1982",
            name: "Johnny Peterson",
            institution: "UT Medical Branch",
          },
          {
            term: "1980-1981",
            name: "Millicent Goldschmidt",
            institution: "UT HSC Houston",
          },
          {
            term: "1979-1980",
            name: "Thomas Matney",
            institution: "UT HSC Houston",
          },
          { term: "1978-1979", name: "B.G. Foster", institution: "UNT" },
          { term: "1977-1978", name: "G. Roland Vela", institution: "UNT" },
          { term: "1976", name: "Lyle Kuhnley", institution: "UT San Antonio" },
          {
            term: "1973-1975",
            name: "Richard A. Finkelstein",
            institution: "UT Southwestern",
          },
          {
            term: "1972-1973",
            name: "Peter Jurushuk",
            institution: "University of Houston",
          },
          { term: "1969-1971", name: "L. J. Rode", institution: "UT Austin" },
          {
            term: "1969",
            name: "Rufus Guthrie",
            institution: "Texas A&M College Station",
          },
          {
            term: "1968-1969",
            name: "Irving Davis",
            institution: "USAF School of Aerospace Medicine",
          },
          {
            term: "1966-1967",
            name: "Eugene Rosenblum",
            institution: "UT Southwestern",
          },
          {
            term: "1965",
            name: "E. O. Bennett",
            institution: "University of Houston",
          },
          {
            term: "1964",
            name: "Willson J. Fahlberg",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1963",
            name: "Willard F. Verwey",
            institution: "UT Medical Branch",
          },
          {
            term: "1962",
            name: "Isaac Peters",
            institution: "Texas Dept of Health",
          },
          {
            term: "1961",
            name: "J.B. Davis",
            institution: "Baylor College of Medicine",
          },
          { term: "1960", name: "J.A. Bass", institution: "Texas Dept of Health" },
          {
            term: "1959",
            name: "Jackson W. Foster",
            institution: "UT Austin",
          },
          {
            term: "1958",
            name: "Roland B. Mitchell",
            institution: "Texas Christian University",
          },
          {
            term: "1957",
            name: "Paul Donaldson",
            institution: "Texas Dept of Health",
          },
          {
            term: "1956",
            name: "Robert P. Williams",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1955",
            name: "Robert M. Pike",
            institution: "UT Southwestern",
          },
          { term: "1954", name: "Orville Wyss", institution: "UT Austin" },
          {
            term: "1953",
            name: "J.B. McBryde",
            institution: "Texas Dept of Health",
          },
          {
            term: "1952",
            name: "Eula B.M. Cook",
            institution: "UT Medical Branch",
          },
          {
            term: "1951",
            name: "Sara E. Sulkin",
            institution: "UT Southwestern",
          },
          {
            term: "1950",
            name: "Charles E. Lankford",
            institution: "UT Austin",
          },
          {
            term: "1949",
            name: "John V. Irons",
            institution: "Texas Dept of Health",
          },
          {
            term: "1948",
            name: "Kenneth L. Burdon",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1947",
            name: "Victor T. Schuhardt",
            institution: "UT Austin",
          },
          {
            term: "1946",
            name: "MacDonald Fulton",
            institution: "UT Medical Branch",
          },
          { term: "1945", name: "O.B. Williams", institution: "UT Austin" },
          { term: "1943-1944", name: "S.W. Bohls", institution: "UT Austin" },
          { term: "1941-1942", name: "I.M. Lewis", institution: "UT Austin" },
        ],
      },
    ],
  },
  {
    id: "vice-president",
    label: "Vice President",
    blocks: [
      {
        entries: [
          {
            term: "1991",
            name: "Mary Pat Moyer",
            institution: "UT HSC San Antonio",
          },
          { term: "1990", name: "James Walker", institution: "UT Austin" },
          {
            term: "1989",
            name: "A. Joanne Bednarz-Prashad",
            institution: "UT Medical School at Houston",
          },
          {
            term: "1988",
            name: "Thomas Huber",
            institution: "Olin E. Teague Veterans' Medical Center",
          },
          {
            term: "1987",
            name: "Charles Gauntt",
            institution: "UT HSC San Antonio",
          },
          { term: "1986", name: "Rex Moyer", institution: "Trinity University" },
          { term: "1985", name: "A. Stephen Kester", institution: "UNT" },
          { term: "1984", name: "L. Joe Berry", institution: "UT Austin" },
          { term: "1983", name: "David N. McMurray", institution: "Texas A&M" },
          {
            term: "1982",
            name: "William C. McDonald",
            institution: "UT Arlington",
          },
          {
            term: "1981",
            name: "Johnny Peterson",
            institution: "UT Medical Branch",
          },
          {
            term: "1980",
            name: "Millicent Goldschmidt",
            institution: "UT HSC Houston",
          },
          {
            term: "1979",
            name: "Thomas Matney",
            institution: "UT HSC Houston",
          },
          { term: "1977-1978", name: "B.G. Foster", institution: "UNT" },
          { term: "1976", name: "G. Roland Vela", institution: "UNT" },
          {
            term: "1974-1975",
            name: "Lyle Kuhnley",
            institution: "UT San Antonio",
          },
          {
            term: "1972-1973",
            name: "Richard A. Finkelstein",
            institution: "UT Southwestern",
          },
          {
            term: "1970-1971",
            name: "Ralph J. Hervey",
            institution: "Texas A&M College Station",
          },
          {
            term: "1969",
            name: "Rufus Guthrie",
            institution: "Texas A&M College Station",
          },
          {
            term: "1966-1968",
            name: "Irving Davis",
            institution: "USAF School of Aerospace Medicine",
          },
          {
            term: "1965",
            name: "Eugene Rosenblum",
            institution: "UT Southwestern",
          },
          {
            term: "1964",
            name: "E.O. Bennett",
            institution: "University of Houston",
          },
          {
            term: "1963",
            name: "Willson J. Fahlberg",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1962",
            name: "Willard F. Verwey",
            institution: "UT Medical Branch",
          },
          {
            term: "1961",
            name: "Isaac Peters",
            institution: "Texas Dept of Health",
          },
          {
            term: "1960",
            name: "J.B. Davis",
            institution: "Baylor College of Medicine",
          },
          { term: "1959", name: "J.A. Bass", institution: "Texas Dept of Health" },
          {
            term: "1958",
            name: "Jackson W. Foster",
            institution: "UT Austin",
          },
          {
            term: "1957",
            name: "Roland B. Mitchell",
            institution: "Texas Christian University",
          },
          {
            term: "1956",
            name: "Paul Donaldson",
            institution: "Texas Dept of Health",
          },
          {
            term: "1955",
            name: "Robert P. Williams",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1954",
            name: "Robert M. Pike",
            institution: "UT Southwestern",
          },
          { term: "1953", name: "Orville Wyss", institution: "UT Austin" },
          {
            term: "1952",
            name: "J.B. McBryde",
            institution: "Texas Dept of Health",
          },
          {
            term: "1951",
            name: "Eula B.M. Cook",
            institution: "UT Medical Branch",
          },
          {
            term: "1950",
            name: "Sara E. Sulkin",
            institution: "UT Southwestern",
          },
          {
            term: "1949",
            name: "Charles E. Lankford",
            institution: "UT Austin",
          },
          {
            term: "1948",
            name: "John V. Irons",
            institution: "Texas Dept of Health",
          },
          {
            term: "1947",
            name: "Kenneth L. Burdon",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1946",
            name: "Victor T. Schuhardt",
            institution: "UT Austin",
          },
          {
            term: "1945",
            name: "MacDonald Fulton",
            institution: "UT Medical Branch",
          },
          { term: "1943-1944", name: "O.B. Williams", institution: "UT Austin" },
          { term: "1941-1942", name: "S.W. Bohls", institution: "UT Austin" },
        ],
      },
    ],
  },
  {
    id: "secretary",
    label: "Secretary",
    blocks: [
      {
        entries: [
          {
            term: "2015-2019",
            name: "M. Gabriela Bowden",
            institution: "University of Houston-Downtown",
          },
          {
            term: "2012-2014",
            name: "Madhusudan Choudhary",
            institution: "Sam Houston State",
          },
          {
            term: "2010-2011",
            name: "Poonam Gulati",
            institution: "University of Houston-Downtown",
          },
          {
            term: "2006-2010",
            name: "Robert J.C. McLean",
            institution: "Texas State",
          },
          {
            term: "2003-2005",
            name: "Brian Wickes",
            institution: "UT HSC San Antonio",
          },
          { name: "Stephen Mattingly" },
          { term: "1993-2002" },
          {
            term: "1984-1992",
            name: "Thomas Stull Matney",
            institution: "UT HSC Houston",
          },
          {
            term: "1977-1983",
            name: "Sam H. Black",
            institution: "Texas A&M College Station",
          },
          {
            term: "1970-1976",
            name: "Thomas Matney",
            institution: "UT HSC Houston",
          },
          {
            term: "1968-1969",
            name: "Donald J. Hahn",
            institution: "UT Austin",
          },
          {
            term: "1964-1967",
            name: "Reuben D. Wende",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1960-1963",
            name: "E.O. Bennett",
            institution: "University of Houston",
          },
          {
            term: "1958-1959",
            name: "Irving Davis",
            institution: "USAF School of Aerospace Medicine",
          },
          {
            term: "1956-1957",
            name: "Jose Rivera",
            institution: "San Jacinto College",
          },
          { term: "1955-1956", name: "W.L. Flannery" },
          {
            term: "1954",
            name: "Robert P. Williams",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1952-1953",
            name: "Frank B. Engley",
            institution: "UT Medical Branch",
          },
          { term: "1950-1951", name: "J.B. Cross" },
          { term: "1948-1949", name: "E.A. Johnson" },
          {
            term: "1946-1947",
            name: "Charles E. Lankford",
            institution: "UT Austin",
          },
          { term: "1945", name: "Arthur Calmer" },
          {
            term: "1941-1944",
            name: "Gordon Worley",
            institution: "UT Medical Branch",
          },
        ],
      },
    ],
  },
  {
    id: "treasurer",
    label: "Treasurer",
    blocks: [
      {
        entries: [
          {
            term: "2011-2020",
            name: "Gregory Frederick",
            institution: "LeTourneau University",
          },
          {
            term: "2003-2011",
            name: "Gary Aron",
            institution: "Texas State",
          },
          { term: "1993-2002" },
          {
            term: "1984-1992",
            name: "Thomas Matney",
            institution: "UT HSC Houston",
          },
          {
            term: "1976-1984",
            name: "Sam H. Black",
            institution: "Texas A&M College Station",
          },
          {
            term: "1968-1976",
            name: "Donald J. Hahn",
            institution: "UT Austin",
          },
          {
            term: "1964-1967",
            name: "Reuben D. Wende",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1960-1963",
            name: "E.O. Bennett",
            institution: "University of Houston",
          },
          {
            term: "1957-1959",
            name: "Irving Davis",
            institution: "USAF School of Aerospace Medicine",
          },
          {
            term: "1956",
            name: "Jose Rivera",
            institution: "San Jacinto College",
          },
          { term: "1955", name: "W.L. Flannery" },
          {
            term: "1954",
            name: "Robert P. Williams",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1953",
            name: "F.B. Engley",
            institution: "UT Medical Branch",
          },
          { term: "1952", name: "Martha Wilkerson" },
          { term: "1950-1951", name: "E.A. Johnson" },
          {
            term: "1948-1949",
            name: "Richard M. Pike",
            institution: "UT Southwestern",
          },
          {
            term: "1941-1947",
            name: "Eula B.M. Cook",
            institution: "UT Medical Branch",
          },
        ],
      },
    ],
  },
  {
    id: "councilor",
    label: "Councilor",
    blocks: [
      {
        entries: [
          {
            term: "2018-2021",
            name: "Robert J.C. McLean",
            institution: "Texas State",
          },
          {
            term: "1998-2018",
            name: "Millicent Goldschmidt",
            institution: "UT HSC Houston",
          },
          { term: "1994-1997" },
          {
            term: "1992-1993",
            name: "Andrew Paquet",
            institution: "Texas Christian University",
          },
          {
            term: "1990-1991",
            name: "Thomas Huber",
            institution: "Olin E. Teague Veterans' Medical Center",
          },
          {
            term: "1988-1989",
            name: "Elizabeth Harris",
            institution: "UNT Health Science Center",
          },
          {
            term: "1986-1987",
            name: "Shelley Payne",
            institution: "UT Austin",
          },
          {
            term: "1983-1985",
            name: "Millicent Goldschmidt",
            institution: "UT HSC Houston",
          },
          {
            term: "1979-1982",
            name: "Peter Jurtshuk",
            institution: "University of Houston",
          },
          {
            term: "1976-1978",
            name: "Eugene Rosenblum",
            institution: "UT Southwestern",
          },
          {
            term: "1972-1975",
            name: "Thomas Matney",
            institution: "UT HSC Houston",
          },
          {
            term: "1968-1971",
            name: "Robert P. Williams",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1964-1967",
            name: "Paul Donaldson",
            institution: "UT Southwestern",
          },
          {
            term: "1960-1963",
            name: "Eula B.M. Cook",
            institution: "UT Medical Branch",
          },
          {
            term: "1956-1959",
            name: "Victor T. Schuhardt",
            institution: "UT Austin",
          },
          {
            term: "1954-1955",
            name: "Charles E. Lankford",
            institution: "UT Austin",
          },
          {
            term: "1952-1953",
            name: "Robert M. Pike",
            institution: "UT Southwestern",
          },
          { term: "1948-1951", name: "Orville Wyss", institution: "UT Austin" },
          {
            term: "1946-1947",
            name: "Kenneth L. Burdon",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1944-1945",
            name: "MacDonald Fulton",
            institution: "UT Medical Branch",
          },
          {
            term: "1942-1943",
            name: "Orville B. Williams",
            institution: "UT Austin",
          },
        ],
      },
    ],
  },
  // TODO: confirm the tab-to-block mapping for the final tab against the live
  // site's interactive tabs. The live page labels this tab "Editor" but the
  // content under it reads as an Alternate Councilors list followed by an Editor
  // list. Both blocks are kept here under the Editor tab as they appear until the
  // exact mapping is verified.
  {
    id: "editor",
    label: "Editor",
    blocks: [
      {
        label: "Alternate Councilors",
        entries: [
          { term: "2014-2016", name: "Lee Hughes", institution: "UNT" },
          { term: "2012-2013", name: "Michael Allen", institution: "UNT" },
          {
            term: "2010-2011",
            name: "Gregory Frederick",
            institution: "University of Mary Hardin-Baylor",
          },
          {
            term: "2008-2009",
            name: "Tonyia Eaves-Pyles",
            institution: "UT Medical Branch",
          },
          {
            term: "2006-2007",
            name: "Rene Massengale",
            institution: "Baylor University",
          },
          {
            term: "2005",
            name: "Millicent Goldschmidt",
            institution: "UT HSC Houston",
          },
          { term: "1998-2004" },
          {
            term: "1995-1997",
            name: "Millicent Goldschmidt",
            institution: "UT HSC Houston",
          },
          { term: "1993-1994" },
          { term: "1991-1992", name: "Mark Shanley", institution: "UNT" },
          {
            term: "1990-1991",
            name: "Millicent Goldschmidt",
            institution: "UT HSC Houston",
          },
          {
            term: "1989-1990",
            name: "Thomas Milligan",
            institution: "Texas A&M College of Medicine",
          },
          {
            term: "1986-1988",
            name: "Elizabeth Harris",
            institution: "Texas College of Osteopathic Medicine",
          },
          { term: "1986", name: "Shelley Payne", institution: "UT Austin" },
          {
            term: "1984-1985",
            name: "Johnny Peterson",
            institution: "UT Medical Branch",
          },
          { term: "1978-1983", name: "G. Roland Vela", institution: "UNT" },
          {
            term: "1976-1978",
            name: "Peter Jurtshuk",
            institution: "University of Houston",
          },
          {
            term: "1972-1975",
            name: "Eugene Rosenblum",
            institution: "UT Southwestern",
          },
          {
            term: "1968-1971",
            name: "Thomas Matney",
            institution: "UT HSC Houston",
          },
          {
            term: "1964-1967",
            name: "Robert P. Williams",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1960-1963",
            name: "Paul Donaldson",
            institution: "UT Southwestern",
          },
          {
            term: "1956-1959",
            name: "Eula B.M. Cook",
            institution: "UT Medical Branch",
          },
          {
            term: "1954-1955",
            name: "Victor T. Schuhardt",
            institution: "UT Austin",
          },
          { term: "1952-1953", name: "Robert B. Mitchell" },
          {
            term: "1950-1951",
            name: "Robert M. Pike",
            institution: "UT Southwestern",
          },
          { term: "1948-1949", name: "P.E. Harrison" },
        ],
      },
      {
        label: "Editor",
        entries: [
          { term: "1989-1992", name: "G. Roland Vela", institution: "UNT" },
          {
            term: "1988",
            name: "A. Joanne Bednarz-Prashad",
            institution: "UT HSC Houston",
          },
          {
            term: "1983",
            name: "Millicent Goldschmidt",
            institution: "UT HSC Houston",
          },
          {
            term: "1981",
            name: "A. Joanne Bednarz-Prashad",
            institution: "UT HSC Houston",
          },
          {
            term: "1969-1971",
            name: "David J. Giron",
            institution: "USAF School of Aerospace Medicine",
          },
          {
            term: "1967-1969",
            name: "Sam H. Black",
            institution: "Baylor College of Medicine",
          },
          {
            term: "1966",
            name: "Ralph J. Hervey",
            institution: "Texas Agricultural Experiment Station",
          },
        ],
      },
    ],
  },
];

function OfficerCard({ officer }: { officer: Officer }) {
  return (
    <article className="rounded-lg border border-border bg-surface-raised p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {officer.role}
      </p>
      <h3 className="mt-1 text-lg font-semibold text-text">{officer.name}</h3>
      <p className="mt-1 text-sm text-text-muted">{officer.affiliation}</p>
      <p className="text-sm text-text-muted">{officer.location}</p>
      <div className="mt-3 space-y-1 text-sm">
        {officer.phone ? (
          <p>
            <a
              href={`tel:${officer.phone}`}
              className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {officer.phone}
            </a>
          </p>
        ) : null}
        {officer.email ? (
          <p>
            <a
              href={`mailto:${officer.email}`}
              className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {officer.email}
            </a>
          </p>
        ) : null}
      </div>
    </article>
  );
}

function PastOfficerRow({ entry }: { entry: PastOfficer }) {
  return (
    <li className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-28 shrink-0 text-sm font-medium text-text-muted">
        {entry.term ?? "Dates not recorded"}
      </span>
      <span className="text-text">
        {entry.name ? (
          <>
            <span className="font-medium">{entry.name}</span>
            {entry.institution ? (
              <span className="text-text-muted"> &middot; {entry.institution}</span>
            ) : null}
          </>
        ) : (
          <span className="text-text-muted">Not recorded</span>
        )}
      </span>
    </li>
  );
}

// A small, self-contained tab set for the past-officer role histories. Follows
// the WAI-ARIA tabs pattern: a tablist of buttons with roving tabindex, arrow
// and Home/End keys to move (activation follows focus), and one visible panel.
function PastOfficersTabs({ tabs }: { tabs: PastOfficerTab[] }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  function selectTab(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectTab(active + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectTab(active - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(tabs.length - 1);
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Past branch officers by role"
        className="flex flex-wrap gap-2"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
              className={
                selected
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-panel hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          tabIndex={0}
          hidden={index !== active}
          className="space-y-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {tab.blocks.map((block, blockIndex) => (
            <div key={block.label ?? blockIndex} className="space-y-2">
              {block.label ? (
                <h3 className="text-lg font-semibold text-text">
                  {block.label}
                </h3>
              ) : null}
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
                {block.entries.map((entry, entryIndex) => (
                  <PastOfficerRow
                    key={`${tab.id}-${blockIndex}-${entryIndex}`}
                    entry={entry}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function BranchOfficers() {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Branch officers
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch is run by elected officers and volunteers from member
          institutions across Texas. They organize the twice-yearly meetings,
          steward the awards program, and represent Texas microbiologists to the
          national society.
        </p>
      </header>

      <section aria-labelledby="current-officers-heading" className="space-y-4">
        <h2
          id="current-officers-heading"
          className="text-xl font-semibold text-text"
        >
          Current officers
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {OFFICERS.map((officer) => (
            <li key={`${officer.role}-${officer.name}`}>
              <OfficerCard officer={officer} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="advisory-board-heading" className="space-y-4">
        <h2
          id="advisory-board-heading"
          className="text-xl font-semibold text-text"
        >
          Advisory board
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ADVISORY_BOARD.map((member) => (
            <li
              key={member.name}
              className="rounded-lg border border-border bg-surface-raised p-4"
            >
              <p className="font-medium text-text">{member.name}</p>
              <p className="mt-1 text-sm text-text-muted">
                {member.institution}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="past-officers-heading" className="space-y-4">
        <div className="space-y-2">
          <h2
            id="past-officers-heading"
            className="text-xl font-semibold text-text"
          >
            Past branch officers
          </h2>
          <p className="max-w-2xl text-text-muted">
            A history of those who have led the branch, by role. Choose a role to
            see its record of term, name, and institution.
          </p>
        </div>
        <PastOfficersTabs tabs={PAST_OFFICER_TABS} />
      </section>
    </div>
  );
}
