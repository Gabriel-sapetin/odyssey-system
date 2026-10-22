# Odyssey learning experience redesign plan

## Goal

Replace the Cisco NetAcad-inspired course and reader presentation with an Odyssey-owned learning interface that fits the new general Home and Explore Lessons design. Keep the existing course content, module order, progress, quizzes, classroom access, document rendering, and role rules working as they do now.

This is a planning document only. No application files are changed as part of this plan.

## What the references show

The supplied screens show the standalone course player using an academy-branded header, outline tabs, a dense module sidebar, and a document-reader style overview. The classroom screen uses a similar course outline and document reader with multiple external viewing modes. On a phone, these controls compete for space with the course content and the persistent bottom navigation.

The redesign should use Odyssey’s own visual language: a light neutral surface, dark navy text, violet accent, rounded white panels, clear type hierarchy, and text-led controls. Do not reproduce Cisco or NetAcad branding, color bars, tab labels, or exact page structure. Do not use emoji or decorative interface icons; retain meaningful course diagrams and user character artwork when they are part of the learning content or Odyssey identity.

## Proposed experience

### 1. Course overview

Rework the initial `course.html` view as an Odyssey course overview rather than a simulated document viewer.

- Use a simple header with the course name, a short description, and a clear **Continue Learning** or **Start Course** action based on existing progress.
- Show current progress with the existing completed-module data and progress calculations.
- Present the four implemented modules as readable cards or rows with module number, title, brief topic summary, completion/available/locked state, and an action to open the module.
- Keep quiz information attached to the relevant module and continue to launch the current quiz flow.
- Make the return path to **Explore Lessons** clear.
- Do not show the unavailable placeholder modules as working content.

### 2. Focused lesson and quiz reader

Restyle the existing module overlay (`data-module-overlay`) as an Odyssey **Lesson Studio**. Keep it in the existing course route and preserve its current lesson and quiz state machine.

- Use a compact top row with a text-only **Back to Course** action, module title, and progress text or bar.
- Use a centered reading column with comfortable line length, clear headings, lists, code examples, and diagrams.
- Keep review and question states visually distinct through labels, spacing, and color—not iconography.
- Use large, plain-text answer choices and clear feedback states.
- Keep Back, Next, Review Again, and completion actions in a consistent reader footer. On mobile, make the primary action easy to reach without covering the current question or input.
- In focused reading or quiz mode on mobile, hide the global tabs if needed and provide text-only return/navigation controls. Restore the shared tabs when the learner returns to the course overview.

### 3. Classroom lesson and document reader

Apply the same Odyssey typography, colors, spacing, panels, and text-first control styling to the classroom lesson view, while retaining the classroom context and its features.

- Keep the class name, instructor, classroom outline, resources, lesson navigation, quiz entry, and class progress visible in the appropriate areas.
- Restyle the reader frame and its **Page Layout**, **Google View**, **Office View**, and **Clean Text** choices as Odyssey controls.
- Keep the current file, iframe, DOCX, PDF, download, and new-tab behaviors. This work changes their presentation, not how documents are loaded or rendered.
- On phones, collapse the classroom outline into a clear text-labeled control or a compact outline section, and allow the document to use the available width. Keep quiz submit and lesson navigation controls reachable above the mobile safe area.

### 4. Shared Odyssey learning components

Use consistent components across Explore Lessons, the standalone course, and classroom learning:

- Text-only breadcrumbs and navigation labels.
- Shared course/module heading styles, progress display, status labels, cards, and primary/secondary buttons.
- Consistent light and dark theme behavior using the learner’s saved preference.
- Clear focus indicators, readable contrast, screen-reader labels, and reduced-motion support.
- Desktop course overview with a main content area and a restrained progress/outline rail; mobile overview as a single-column card list.

## Preserve existing behavior

- Keep current module IDs, lesson content, quiz questions, answers, scoring, completion rules, and progress persistence.
- Keep the existing locked-module and advanced-lab conditions. A visual redesign must not unlock content or change redirects.
- Keep classroom membership, role checks, instructor tools, resource permissions, and class-specific progress unchanged.
- Keep the current document sources and display fallbacks, including browser PDF, DOCX preview, Google/Office viewer, Clean Text, download, and open-in-new-tab actions where they already exist.
- Keep routes and event hooks used by `main.js`, `classroom.js`, and the course overlay. Visual state should bind to the existing data and events.

## Implementation sequence

1. **Inventory and map states:** Identify the course overview, module outline, review state, quiz states, completion state, locked state, classroom hub, classroom reader modes, and their current DOM IDs and event hooks.
2. **Define Odyssey visual tokens:** Apply the colors, typography, spacing, radii, and button patterns already used by the redesigned Home and Explore Lessons pages. Remove NetAcad-specific visual treatment from the course experience.
3. **Redesign course overview:** Replace the initial document-preview framing with a course introduction, progress summary, and module list while retaining the existing module actions.
4. **Redesign Lesson Studio:** Restyle the module overlay and quiz interactions for desktop and mobile without changing question generation, scoring, or completion logic.
5. **Restyle classroom reading:** Update classroom reader templates and layout controls to match Odyssey while preserving document sources, class permissions, and viewer behavior.
6. **Responsive review:** Review desktop and phone sizes, long module titles, locked/completed states, answer choices, keyboard-open forms, document modes, safe areas, and the transition between course overview and focused lesson mode.

## Scope and guardrails

- Frontend markup, CSS, labels, and presentation/navigation only.
- Do not change backend services, APIs, database schema, authentication, classroom permissions, document storage, quiz scoring, learning content, progress calculations, or module unlock logic.
- Do not add pretend AI features, course authoring, viewer modes, lessons, quizzes, or course modules.
- Reuse the current module and classroom content rather than duplicating it into a second source of truth.
- Avoid broad restyling of unrelated profile, admin, simulator, or marketing pages. Share tokens/components only where that can be done without changing their behavior or visual intent.

## Completion criteria

- The course overview and reading experience look and feel like Odyssey rather than Cisco NetAcad.
- A learner can start or continue each currently available module and use the existing quiz flow.
- Module progress, locked states, and completion behavior remain unchanged.
- Classroom lessons retain outline, resource, quiz, progress, and document-viewing features.
- Desktop and mobile layouts remain usable without overlapping navigation, lesson actions, quizzes, or document controls.
- No backend or learning-service behavior changes are included.
