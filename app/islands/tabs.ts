// The past officers' tabs' island (devkit's startIslands, app/site.ts): on /branch-officers, which sends no React, it
// starts Capsomer's tabs behavior on the markup branch-officers.tsx renders (arrow keys, Home and End, activation
// follows focus). Only that page names it, so no other page loads the tabs code.
import { enhance } from "capsomer/behavior/tabs";

export default function tabs(element: Element) {
  enhance(element);
}
