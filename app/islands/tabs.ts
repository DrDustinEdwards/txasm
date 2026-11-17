// The tabs island (devkit's startIslands, app/site.ts): on /branch-officers, which sends no React, it starts
// Capsomer's tabs behavior (arrow, Home and End keys, activation follows focus) on the markup the route renders.
// Only that page has tabs, so the behavior loads there and stays out of /site.js on every other page.
import { enhance } from "capsomer/behavior/tabs";

export default function tabs(el: HTMLElement) {
  enhance(el);
}
