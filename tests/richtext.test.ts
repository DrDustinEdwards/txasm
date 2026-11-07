import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeBody, sanitizeTitle } from "../app/lib/richtext";

// Every abstract title and body is stored through these and shown as HTML on about 20 pages (the program, the book,
// the public archive, review), so what comes out must be only <em>, <sup>, <sub> and escaped text.
test("stored abstract HTML keeps em, sup and sub and nothing that can run", () => {
  const hostile = [
    "<script>alert(1)</script>",
    "<SCRIPT SRC=//example.com/x.js></SCRIPT>",
    "<img src=x onerror=alert(1)>",
    '<img src="a>b" onerror=alert(1)>',
    "<em onclick=alert(1)>hi</em>",
    "<em/onmouseover=alert(1)>hi</em>",
    '<a href="javascript:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    "<svg><script>alert(1)</script></svg>",
    "<svg/onload=alert(1)>",
    "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
    "<style>body{background:url(javascript:alert(1))}</style>",
    '<sup style="background:url(javascript:alert(1))">2</sup>',
    "<iframe srcdoc='<script>alert(1)</script>'></iframe>",
    "<scr<script>ipt>alert(1)</script>",
    "<!--><img src=x onerror=alert(1)>-->",
    "<img src=x onerror=alert(1)",
    "\u0000<script>alert(1)</script>",
  ];
  for (const input of hostile) {
    for (const out of [sanitizeBody(input), sanitizeTitle(input)]) {
      const tags = out.match(/<[^>]*>/g) ?? [];
      assert.ok(
        tags.every((t) => /^<\/?(em|sup|sub)>$/.test(t)),
        `${input} -> ${out}`,
      );
      assert.ok(!/<[a-z!/]/i.test(out.replace(/<\/?(em|sup|sub)>/g, "")), `${input} -> ${out}`);
    }
  }

  assert.equal(
    sanitizeBody(
      "<p>E. coli<em>  K-12</em> grew 10<sup>6</sup> CFU in H<sub>2</sub>O &amp; <b>LB</b> &lt;5 h</p>",
    ),
    "E. coli<em>  K-12</em> grew 10<sup>6</sup> CFU in H<sub>2</sub>O &amp; LB &lt;5 h",
  );
  assert.equal(sanitizeTitle("<EM>Bacillus</EM> <sup>1</sup>"), "<em>Bacillus</em> 1");
  assert.equal(sanitizeBody("<em>open <sup>x</em> y"), "<em>open <sup>x</sup></em><sup> y</sup>");
});
