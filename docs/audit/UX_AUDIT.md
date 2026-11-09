# UX and Accessibility Audit — Phase 0

**Method:** Static inspection of the Research Lab HTML, CSS, and JavaScript. No live browser, screen-reader, or manual keyboard session was performed.

## Existing UX strengths

- Research Lab has a clear information hierarchy and section navigation.
- Page includes a persistent navigation bar with a labelled navigation landmark.
- API connection status uses `role="status"`.
- Dataset is explicitly labelled synthetic.
- Hero section explains the research question and warns against operational interpretation.
- Tables use column headers with `scope="col"`.
- Dynamic score bars include accessible labels.
- The stylesheet includes responsive breakpoints at 900, 680, and 420 pixels.
- Reduced-motion preference is represented in CSS.
- The UI provides loading and API-unavailable states.
- Research sections include model, allocation, route, robustness, figures, and methods content.

## UX risks and opportunities

### UX-01 — No browser verification evidence (High coverage gap)
Static markup and CSS do not establish that the page works at real viewport sizes or with actual browser interaction.

**Follow-up:** Run the Research Lab in a browser at desktop, tablet, and mobile sizes. Test every navigation link, selector, chart, table, API failure state, and reload.

### UX-02 — Accessibility needs interaction-level review (Medium)
Some semantic and ARIA support is present, but static inspection cannot verify focus order, visible focus, contrast, dynamic announcements, or screen-reader behavior.

**Follow-up:** Conduct keyboard-only review and automated accessibility scan. Verify all interactive controls have labels and sensible focus behavior.

### UX-03 — Data interpretation needs consistent context (Medium)
Research outputs should consistently show synthetic-data status, units, model assumptions, and limitations near the relevant result—not only in a top-level disclaimer.

**Follow-up:** Audit every visualization, export, and summary card for provenance and interpretation context.

### UX-04 — API failure state is broad (Low/Medium)
The current boot flow loads all five research endpoints together. If one endpoint fails, the page enters a broad error state and multiple result areas display the same error.

**Follow-up:** Consider section-level error handling only if it improves recoverability without hiding incomplete research outputs.

### UX-05 — Responsive navigation requires testing (Medium)
The top navigation has several links and a status indicator. CSS has responsive breakpoints, but no browser evidence establishes usability at narrow widths.

**Follow-up:** Test overflow, tap target size, sticky header behavior, and anchor offsets on mobile.

### UX-06 — Visual design should remain subordinate to research clarity
The visual system is coherent and should not be replaced merely to add visual complexity.

**Follow-up:** Prioritize readability, chart accuracy, data provenance, and interaction clarity over decorative effects.

## Accessibility verification checklist

- [ ] Keyboard-only navigation.
- [ ] Visible focus indicator.
- [ ] Logical focus order.
- [ ] Screen-reader labels for selectors and controls.
- [ ] Table header relationships.
- [ ] Contrast checks.
- [ ] Reduced-motion behavior.
- [ ] 200% zoom and text reflow.
- [ ] Mobile viewport and touch-target review.
- [ ] Dynamic API status announcement.
- [ ] Error-state announcement.
- [ ] SVG accessible names/alternatives.

## Conclusion

Static UX inspection is complete. The Research Lab has a solid semantic and responsive starting point, but no claim of WCAG conformance or browser-tested responsiveness is made. Browser and accessibility validation remain Phase 4/7 requirements.
