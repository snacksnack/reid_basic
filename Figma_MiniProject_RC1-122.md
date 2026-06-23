# Figma Mini-Project: Learn Figma by Redesigning Your Resume Site

**Linked to:** [RC1-122](https://hirereidcollins.atlassian.net/browse/RC1-122) (Epic) · [RC1-123](https://hirereidcollins.atlassian.net/browse/RC1-123) (Audit story)
**For:** Reid Collins — Figma TPM application
**Goal:** Go from zero Figma experience to a credible, end-to-end *design → prototype → handoff* artifact, using your *actual* resume site as the subject matter.

---

## Why this approach

You don't need to become a visual designer to be a strong Figma TPM. You need to be fluent in three things: **reading and structuring designs** (FigJam + frames), **understanding components and design systems** (the reusable building blocks), and **the design-to-engineering handoff** (Dev Mode + specs). This project builds exactly those three muscles, and because you're rebuilding your own React site, every exercise doubles as real progress on Epic RC1-122.

Budget about **3–4 hours total**, in five sittings. Do them in order; each one teaches a named skill you'll reuse.

---

## Your site's real design system (use these exact values)

Building from your live tokens makes the mockup feel real and gives you a true design-to-code story.

| Element | Value (from your code) |
|---|---|
| Text color | `#0b1220` |
| Muted text | `#5b657a` |
| Accent (links/buttons) | `#0f62fe` |
| Border | `#e6e8ee` |
| Background | `#ffffff` |
| Content width | 850px, centered |
| Name size/weight | 28px / Bold (700) |
| Section titles | ~13px, UPPERCASE, letter-spacing, bottom rule |
| Buttons | white fill, 1px `#e6e8ee` border, 8px corner radius |
| Skill chips | pill shape (fully rounded corners) |

**Real content to drop in** (so you're not typing lorem ipsum):
- Name: **Reid Collins**
- Title: **Senior Technical Program Manager / Backend Engineer**
- Location: **Brooklyn, NY**
- Toolbar actions: **Download PDF**, **Download DOCX**, **Contact Reid**
- Sections present today: Summary, Technical Skills, Professional Experience (with a career timeline), Education, Projects, Certifications, Links — plus a **ChatBot** and a **`/match`** feature.

---

## Before you start

1. Create a free Figma account at figma.com (the free "Starter" plan covers everything here).
2. Decide: **browser or desktop app.** The browser works fine for learning. Install the **desktop app** later, because the local Figma MCP server (the Claude integration) needs it.
3. In your account you'll see two file types you can create: **FigJam** (whiteboard) and **Design** (the UI canvas). You'll use both.

---

## Exercise 1 — FigJam: Map the recruiter journey (~30 min)

**Skills learned:** the canvas, panning/zooming, sticky notes, sections, connectors, text. This is the gentlest on-ramp and it directly produces a deliverable for the RC1-123 audit.

This maps a recruiter's real path through your site: *land → skim headline → scan experience → download the right resume → contact you → (optionally) use the chatbot or `/match`.*

**Steps**
1. Create a new **FigJam** file. Name it `RC1-123 Recruiter Journey`.
2. Press **S** for sticky note. Drop one sticky per journey stage across the top, left to right:
   `Arrives` → `Skims headline` → `Scans experience` → `Downloads resume` → `Contacts Reid` → `Uses chatbot / match`.
3. Under each stage, add stickies in a second color for **what the recruiter is thinking** ("Is this person senior enough?", "Which resume do I grab — PDF or DOCX?").
4. Add a third row in a warning color for **friction points** you noticed in the audit (e.g., "title is hidden via CSS", "two download buttons — which do I pick?", "is the chatbot trustworthy?").
5. Hover the edge of a sticky until a **+** appears, then drag to draw a **connector** between stages. Connectors are how you show flow.
6. Select a stage's stickies and wrap them in a **Section** (right-click → *Add to section*, or the section tool) so each stage is a labeled container.

**Done when:** you have a left-to-right flow with stage / thought / friction rows, connected by arrows. Export it (top-left menu → *Export*) as a PNG to attach to RC1-123.

> **TPM note:** this artifact *is* the deliverable RC1-123 asks for ("proposed recruiter journey map" + "3–5 improvement opportunities"). You're learning Figma and closing a ticket at once.

---

## Exercise 2 — Figma Design: Rebuild your resume header & toolbar as a frame (~60 min)

**Skills learned:** frames, the properties panel, text styles, color styles, and **auto layout** (the single most important Figma concept).

**Steps**
1. Create a new **Design** file named `RC1-122 Resume Redesign`.
2. Press **F** (Frame). In the right panel choose **Desktop (1440)**, or draw a custom frame. Inside it you'll keep an 850px-wide content column to match your site.
3. **Set up color styles first.** Open the *Local styles* / variables panel and create color styles for `text #0b1220`, `muted #5b657a`, `accent #0f62fe`, `border #e6e8ee`. Now you can apply brand colors by name instead of re-typing hex — this is a baby design system.
4. **Header.** Press **T**, type `Reid Collins`, set 28px / Bold / `text` color, centered. Below it add the title `Senior Technical Program Manager / Backend Engineer` and a contact line `Brooklyn, NY · hire.reid.collins@gmail.com · hihelloreid.com` in `muted`.
5. **Toolbar.** Make one button: draw a rectangle, set fill white, stroke `border` 1px, corner radius 8. Add a text label `Download PDF` on top. Select both, press **⌘/Ctrl + G** to group — then convert to **auto layout** with **Shift + A**. Auto layout makes the button pad its text automatically.
6. Duplicate the button twice (**⌘/Ctrl + D**) and relabel: `Download DOCX`, `Contact Reid`. Select all three and apply **auto layout** again to space them as a row with even gaps.
7. Select your whole content column and apply **auto layout** vertically so sections stack with consistent spacing — resize the frame and watch everything reflow.

**Done when:** you have a centered header + a 3-button toolbar row that visually matches your live site, all built with auto layout (try dragging the frame wider — nothing should break).

> **Why auto layout matters for a TPM:** it's Figma's version of flexbox. When you can say "this maps to a flex row with gap and padding," you speak both designer and engineer — exactly the translation a Figma TPM does.

---

## Exercise 3 — Components: turn the button into a reusable component with variants (~30 min)

**Skills learned:** components, instances, and variants — the heart of a design system and the thing Code Connect maps to real code.

**Steps**
1. Select your `Download PDF` button. Right-click → **Create component** (**⌥/Alt + ⌘/Ctrl + K**). The purple diamond icon means it's now a *main component*.
2. Drag out copies — these are **instances**. Change one instance's label; notice it stays linked to the main component for styling.
3. Select the main component → in the right panel click **Add variant**. Create a `default` and a `hover` variant (make hover's fill a very light `accent` tint). Variants are how a single component expresses multiple states — the same way your CSS has `.toolbar-button` and its `:hover`.
4. Rename the component `Button` and its property `State: default / hover`.

**Done when:** you have one `Button` component with two variants, and a few instances placed in your toolbar.

> **TPM note:** when you later wire up the Figma MCP / Code Connect, components like this `Button` get mapped to your real `toolbar-button` React element — that's the literal design-to-code bridge you'll demo.

---

## Exercise 4 — Prototype: make "Contact Reid" open the contact modal (~20 min)

**Skills learned:** prototyping — turning static frames into a clickable flow.

Your site has a `ContactModal` that opens from the **Contact Reid** button. Recreate that interaction.

**Steps**
1. Make a simple second frame that looks like a contact modal (a card with `Name`, `Email`, `Message` fields and a `Send` button — rough is fine).
2. Switch to the **Prototype** tab (top-right). Select your `Contact Reid` button, drag the little circular node to the modal frame.
3. In the interaction settings choose **On click → Open overlay** (or Navigate to). 
4. Press the **Play** button (top-right) to launch the prototype and click your button — the modal should appear.

**Done when:** clicking `Contact Reid` in presentation mode opens your modal. That's a working prototype you can screen-record for your case study.

---

## Exercise 5 — Dev Mode + the Claude/Figma handoff (~30 min)

**Skills learned:** Dev Mode (the engineering handoff view) and how the Claude integration plugs in. This is your strongest TPM talking point.

**Steps**
1. Toggle **Dev Mode** (the `</>` switch, top-right). The panel now shows measurements, colors, and CSS-like specs for whatever you select. Click your `Button` and read the generated spacing/border values — compare them to your real `.toolbar-button` CSS.
2. Install the **Figma desktop app** if you haven't (the local MCP server needs it).
3. Connect the **Figma MCP connector** in Claude (we surfaced it earlier — "Generate diagrams and better code from Figma context"). Once connected, Claude can read this very file via tools like `get_design_context` and `get_screenshot` and generate React that matches.
4. Try the loop: ask Claude to turn your `Resume Redesign` frame into a React component, and compare it against your existing `Resume.tsx`.

**Done when:** you've read a spec in Dev Mode and (optionally) generated code from your frame via the connector. Even just doing step 1 gives you a real handoff story.

---

## Wrap-up: your interview case study (15 min)

Capture this while it's fresh — it's the "2–3 minute story" your Epic's success criteria call for. Jot answers to:

- **Problem:** what recruiter friction did the RC1-123 audit surface?
- **Process:** FigJam journey map → Figma mockup with a small design system → component with variants → clickable prototype → Dev Mode handoff.
- **Outcome:** at least one improvement you'd ship to the real React site (e.g., collapsing two download buttons into one primary action, or surfacing the hidden job title).
- **The Figma-specific insight:** "Auto layout and components map cleanly onto flexbox and React components, which is why design-to-code handoff via the Figma MCP works — and why a TPM who understands both sides reduces handoff churn."

Save a few screenshots and paste them, plus these notes, into RC1-122 or a linked Confluence page.

---

## Figma cheat sheet (keyboard + terms)

| Key | Action |
|---|---|
| **F** | Frame (artboard) |
| **T** | Text |
| **R** | Rectangle |
| **S** | Sticky note (FigJam) |
| **Shift + A** | Add auto layout |
| **⌘/Ctrl + G** | Group |
| **⌥⌘K / Alt+Ctrl+K** | Create component |
| **⌘/Ctrl + D** | Duplicate |
| **Space + drag** | Pan canvas |

**Terms worth knowing:** *Frame* (a container / artboard), *Auto layout* (flexbox-style spacing), *Component* (reusable master), *Instance* (a linked copy), *Variant* (a state of a component), *Style/Variable* (named color or text token), *Dev Mode* (engineer handoff view), *FigJam* (whiteboard for flows and journeys).

---

*Tip: Do Exercise 1 today — it's quick, low-pressure, and immediately completes a deliverable on RC1-123.*
