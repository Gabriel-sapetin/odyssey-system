# Odyssey general dashboard and lesson discovery plan

## Goal

Redesign Odyssey’s overall signed-in experience around a general learning home, using the supplied Gizmo screens as the layout reference. The dashboard should not display Operating Systems course content. A clear **Explore Lessons** entry should take learners to a separate page where the existing Operating Systems course, modules, quizzes, and interactive labs can be found.

This turn is planning only. The implementation should change frontend presentation and navigation while preserving existing API, authentication, progress, classroom, quiz, and simulator services.

## What the references suggest

The Gizmo desktop home separates navigation from the working area: a left navigation rail, a spacious central home view, and a right column for account or learning information. Its mobile view simplifies that structure into a single column with persistent navigation and prominent actions.

Odyssey can use the same structure while keeping its own name, colors, and optional penguin character artwork. Use a clean surface, readable sans-serif typography, rounded cards, and clear spacing. Do not use emoji or interface icons. Navigation, action buttons, tabs, and stat labels should use plain text. The penguin may appear as character artwork, but should not replace a text label or act as a control icon.

## Proposed information architecture

### Desktop shell

- **Left navigation:** Home, My Learning, Explore Lessons, Classes, Profile. Show role-specific destinations such as My Classes or Management as plain-text links for the appropriate roles.
- **Central area:** The current page’s main task and content.
- **Right rail:** Existing platform-level account information such as total XP, level/rank, badges, and streak. Keep these figures subject-neutral and text-labeled. Do not add currencies or counters the app does not currently support.
- **Secondary actions:** Leaderboard, theme, avatar changes, and sign out remain reachable through a plain-text More menu or the relevant profile/account area.

### Mobile shell

- Use a compact top bar with the Odyssey name and text-labeled account/theme actions.
- Use a fixed text-only navigation bar with Home, My Learning, Explore Lessons, Classes, and Profile. Do not render decorative icons or emoji in the tabs.
- Preserve role-specific access within the same five-item limit by adapting a destination label or placing lower-frequency actions under More.
- Hide the global navigation while a simulation is active. Use a text-only simulation dock with a back-to-lessons link and only the controls supported by that simulator.
- Keep safe-area padding and the existing keyboard and AI-tutor collision rules.

## Home dashboard

### Remove from Home

Move the OS-specific course hero, OS simulation cards, System Lab unlock panel, and OS-specific lesson/activity labels off the dashboard. Do not show an OS course title, OS lesson name, or OS progress as the default Home content.

### Replace with a general learning home

- Start with a welcoming heading such as **What would you like to learn today?** and a short, subject-neutral description.
- Make **Explore Lessons** the main call to action. It opens the new lesson-discovery page.
- Keep a compact account summary for existing platform-level stats such as XP, rank/level, badges, and streak. Use plain text and values without emoji or icon assets.
- Keep existing account/profile access and the user’s selected character artwork where it helps the page feel like Odyssey.
- Do not add an apparently working general-purpose AI prompt, course generator, upload flow, or subject catalog unless an existing frontend action and service already support it. The current AI tutor is OS-focused; this redesign must not present it as a general-subject tutor.
- If the learner has no general course data to populate a section, use the Explore Lessons action instead of filling Home with the current OS curriculum.

## Explore Lessons page

Create a dedicated **Explore Lessons** destination. It becomes the single discovery surface for the Operating Systems material already built into Odyssey.

- Present the Operating Systems course as the available featured course, clearly identified by subject.
- Group the existing modules, lessons, and quizzes under that course. The course card and module entries should link to the existing course player and its current lesson flows.
- Group the existing OS simulators under an **Interactive Labs** section on the same page. Link to the existing boot, system-call, scheduling, memory, process, thread, file-system, disk, virtual-memory, and deadlock simulator routes where they are currently available.
- Preserve existing course completion, unlock, and access rules. Keep locked labs visibly locked and do not create new access paths around current gating.
- Audit placeholder links and incomplete modules. Do not style a placeholder as an available lesson or lab; label it as unavailable/coming soon or omit its action until it works.
- Keep leaderboard, classes, profile, and instructor tools in their existing destinations rather than mixing them into this lesson index.

This page is a discovery/index view, not a replacement course player. Opening a module or lab should continue to use the existing page and behavior.

## Visual and interaction rules

- Use plain-text navigation, action labels, buttons, and stat names. No emoji or decorative interface icons.
- Keep actual course diagrams and simulator visualizations; those are instructional content, not interface decoration.
- Use one primary action per screen. On Home, that action is Explore Lessons.
- Keep card titles and course subjects explicit. The global shell remains subject-neutral; OS terminology appears inside Explore Lessons and the OS course.
- Keep mobile controls at comfortable touch sizes and use full-width actions where appropriate.
- Respect the saved light/dark preference. For a new mobile visit without a saved preference, use the light Gizmo-like surface.
- Preserve screen-reader labels, keyboard focus, text zoom, reduced-motion preferences, safe areas, and scroll clearance around fixed navigation and simulation controls.

## Role handling

- Learners get Home, My Learning, Explore Lessons, Classes, and Profile.
- Professors/instructors keep access to My Classes and their existing classroom tools; admin users keep Management access.
- Do not add a Create Course or AI-generated course authoring destination as if it were already implemented. Those features belong to the broader product roadmap and require separate service work.
- Resolve role-specific presentation from the existing authenticated profile flow. Do not introduce a second role store or change role authorization.

## Implementation sequence

1. **UI inventory:** Identify every OS-specific block currently rendered on the dashboard, the existing course-player routes, simulator routes, role navigation, and any placeholder links.
2. **Shared shell:** Replace the current mobile-only navigation treatment with the Gizmo-inspired desktop left rail and responsive mobile text navigation. Keep desktop and mobile using the same neutral information architecture.
3. **General Home:** Remove OS-specific course and lab content from the dashboard. Add the general welcome, Explore Lessons call to action, and text-only platform stats using existing data bindings.
4. **Explore Lessons:** Add the page and organize the current OS course, modules, quizzes, and labs there. Reuse existing destinations and preserve current service behavior and unlock logic.
5. **Role and focused views:** Keep professor/admin routes discoverable, and retain a focused, text-only simulation dock without global tabs during active simulator use.
6. **Responsive review:** Review desktop and phone layouts, including 375–412px widths, light/dark themes, keyboard-open states, safe areas, locked labs, role-specific navigation, and the AI-tutor/simulation-dock collision zone.

## Guardrails

- Frontend presentation and navigation only. Do not modify backend services, APIs, database schema, authentication rules, course generation, XP calculations, quiz scoring, classroom permissions, or simulator logic.
- Reuse existing links and actions. Do not add dead buttons or imply support for general AI learning workflows that the existing services do not provide.
- Keep all existing OS learning reachable from Explore Lessons, and keep it out of the general Home view.
- Retain desktop and mobile access to current account, classroom, role, learning, and simulator capabilities.

## Completion criteria

- Home contains no OS-specific course, lesson, lab, or unlock content.
- A learner can select Explore Lessons and find the existing OS course, its built-in modules/quizzes, and available simulators in one organized place.
- The app uses a Gizmo-inspired responsive layout with text-only navigation and controls.
- XP, rank/level, badges, streak, authentication, course progress, quiz behavior, classrooms, and simulator behavior continue to use the existing frontend bindings and services.
- No unsupported general AI composer, course generator, currency, or action is presented as functional.
