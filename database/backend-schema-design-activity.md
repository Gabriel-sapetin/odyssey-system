# Activity: Design a Backend Schema for Your Proposed System

**System Name:** OS Odyssey  
**Duration:** 60–90 minutes | **Format:** Pairs  
**Members:** Gabriel Sapetin  

---

## Step 1: Restate the System (5 min)

**OS Odyssey** is a gamified, interactive Operating Systems learning platform where students sign up, progress through OS course modules (Introduction to OS, OS Structures, Processes, Threads), practice with interactive simulators (boot sequence, system calls, CPU scheduling, memory management, process states, thread visualization, file system, deadlock, disk scheduling, virtual memory), earn XP and badges, maintain daily login streaks, compete on a leaderboard, and — through an admin-managed classroom system — professors can create classes, invite students via join codes, upload custom modules, and generate quizzes (manually or via AI) for their enrolled students.

---

## Step 2: Identify Entities (10 min)

The "nouns" of the system — the real-world things that need to be stored:

| # | Entity | What it represents |
|---|--------|--------------------|
| 1 | Users | Authenticated user accounts (managed by Supabase Auth) |
| 2 | Profiles | User profile data: username, avatar, XP, level, rank, streak, role |
| 3 | Modules | The 4 OS learning modules (Intro, Structures, Processes, Threads) |
| 4 | Quizzes | One quiz per module with metadata |
| 5 | Questions | Individual multiple-choice questions within a quiz |
| 6 | Quiz Attempts | A student's submission record for a quiz |
| 7 | Simulations | The 10 interactive OS simulators |
| 8 | Simulation Completions | A student's completion record for a simulation |
| 9 | Badges | The 10 earnable achievement badges |
| 10 | User Badges | Join table: which badges a user has earned |
| 11 | User Progress | Per-module progress tracking (percentage, completion) |
| 12 | Security Audit Log | Forensic trail for all gameplay mutations |
| 13 | Classrooms | A professor-owned learning space with an invite code |
| 14 | Classroom Members | Join table: students enrolled in a classroom |
| 15 | Classroom Modules | Professor-uploaded lesson content for a classroom |
| 16 | Classroom Quizzes | Professor-created or AI-generated quizzes for a classroom |
| 17 | Classroom Quiz Questions | Individual questions within a classroom quiz |
| 18 | Classroom Quiz Attempts | Student submission records for classroom quizzes |

---

## Step 3: Define Attributes (15 min)

For each entity, the fields it needs, their data types, and key constraints:

### Core System Tables

**users**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | UUID | PK | Managed by Supabase Auth |
| email | TEXT (unique) | | User's email address |
| created_at | TIMESTAMPTZ | | Account creation timestamp |

**profiles**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | UUID | PK, FK → users.id | 1:1 with users, auto-created on signup |
| email | TEXT (unique, not null) | | Copied from auth |
| username | TEXT (not null) | | Display name, default: email prefix |
| character | TEXT | | 'Kernel Penguin', 'Scheduler Scout', or 'Memory Monitor' |
| avatar | TEXT | | Image path for chosen character |
| level | INT | | Derived: floor(xp / 20), min 1 |
| xp | INT | | Total experience points, default 20 |
| role | TEXT | | 'student' (default), 'professor', or 'admin' |
| rank | TEXT | | Bronze / Silver / Gold / Platinum |
| badges | INT | | Count of earned badges |
| streak | INT | | Current consecutive login days, default 1 |
| completed_modules | TEXT[] | | Array of completed module IDs |
| earned_badges | TEXT[] | | Array of earned badge IDs |
| last_active_date | DATE | | For streak calculation |
| created_at | TIMESTAMPTZ | | Profile creation timestamp |

**modules**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| module_id | BIGSERIAL | PK | Auto-increment |
| title | VARCHAR(150) | | e.g. "Introduction to Operating Systems" |
| description | TEXT | | Module summary |
| module_order | INT | | Display sequence (1, 2, 3, 4) |
| statements | INT | | Number of quiz questions in this module |

**quizzes**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| quiz_id | BIGSERIAL | PK | Auto-increment |
| module_id | BIGINT | FK → modules.module_id | Each module has exactly one quiz |
| title | VARCHAR(150) | | Quiz title |
| total_questions | INT | | Number of questions |

**questions**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| question_id | BIGSERIAL | PK | Auto-increment |
| quiz_id | BIGINT | FK → quizzes.quiz_id | Which quiz this belongs to |
| question_text | TEXT | | The question prompt (may contain HTML) |
| question_type | TEXT | | 'multiple_choice' or 'true_false' |
| options | JSONB | | Array of answer choice strings |
| correct_answer_index | INT | | 0-based index of the correct option |
| correct_label | TEXT | | 'A', 'B', 'C', or 'D' |
| explanation | TEXT | | Explanation shown after answering |

**quiz_attempts**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| attempt_id | BIGSERIAL | PK | Auto-increment |
| user_id | UUID | FK → users.id | Who attempted the quiz |
| quiz_id | BIGINT | FK → quizzes.quiz_id | Which quiz was attempted |
| score | INT | | Number of correct answers |
| total_questions | INT | | Total questions in the attempt |
| passed | BOOLEAN | | Whether score met passing threshold |
| attempted_at | TIMESTAMPTZ | | When the attempt was submitted |

**simulations**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| simulation_id | BIGSERIAL | PK | Auto-increment |
| title | VARCHAR(50) | | e.g. "Boot & Interrupts" |
| description | TEXT | | What the simulator teaches |
| topic | VARCHAR(100) | | OS topic area |
| max_bonus_xp | INT | | Maximum bonus XP awardable (default 50) |

**simulation_completions**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| completion_id | BIGSERIAL | PK | Auto-increment |
| user_id | UUID | FK → users.id | Who completed the sim |
| simulation_id | BIGINT | FK → simulations.simulation_id | Which sim was completed |
| best_score | INT | | Highest score achieved |
| bonus_xp | INT | | Highest bonus XP earned |
| completed_at | TIMESTAMPTZ | | First completion timestamp |
| last_played_at | TIMESTAMPTZ | | Most recent play timestamp |

**badges**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| badge_id | BIGSERIAL | PK | Auto-increment |
| name | VARCHAR(100) | | e.g. "OS Pioneer", "Boot Commander" |
| description | TEXT | | What the badge is for |
| icon | TEXT | | Emoji icon (e.g. '🖥️', '⚡') |
| color | TEXT | | Hex color for display (e.g. '#22c55e') |
| trigger_id | TEXT | | Event that earns it: 'module1', 'sim_boot', etc. |

**user_badges**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| user_badge_id | BIGSERIAL | PK | Auto-increment |
| user_id | UUID | FK → users.id | Who earned it |
| badge_id | BIGINT | FK → badges.badge_id | Which badge |
| earned_at | TIMESTAMPTZ | | When it was earned |

**user_progress**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| progress_id | BIGSERIAL | PK | Auto-increment |
| user_id | UUID | FK → users.id | Whose progress |
| module_id | BIGINT | FK → modules.module_id | Which module |
| progress_percentage | DECIMAL | | 0.00 to 100.00 |
| completed | BOOLEAN | | Whether module is fully completed |
| updated_at | TIMESTAMPTZ | | Last progress update |

**security_audit_log**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | BIGSERIAL | PK | Auto-increment |
| user_id | UUID | FK → users.id | Who triggered the action |
| action | TEXT | | 'complete_module', 'award_badge', 'quiz_xp', 'update_streak', 'profile_update' |
| detail | JSONB | | Before/after snapshots (e.g. xp_before, xp_after) |
| ip_address | TEXT | | Client IP from X-Forwarded-For |
| user_agent | TEXT | | Browser user-agent string |
| created_at | TIMESTAMPTZ | | When the event occurred |

---

### Classroom Feature Tables (Admin/Professor/Student)

**classrooms**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | UUID | PK | Auto-generated |
| professor_id | UUID | FK → profiles.id | The professor who owns this classroom |
| name | TEXT | | e.g. "OS 101 — Section A" |
| description | TEXT | | Optional classroom description |
| join_code | TEXT (unique) | | 6-character invite code for students |
| is_active | BOOLEAN | | Default true; professor can archive |
| max_students | INT | | Optional student cap (default 100) |
| created_at | TIMESTAMPTZ | | Creation timestamp |

**classroom_members**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | UUID | PK | Auto-generated |
| classroom_id | UUID | FK → classrooms.id | Which classroom |
| student_id | UUID | FK → profiles.id | Which student |
| joined_at | TIMESTAMPTZ | | When student enrolled |
| | | UNIQUE(classroom_id, student_id) | Prevents duplicate enrollment |

**classroom_modules**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | UUID | PK | Auto-generated |
| classroom_id | UUID | FK → classrooms.id | Which classroom |
| title | TEXT | | Lesson title |
| description | TEXT | | Lesson summary |
| content | TEXT | | Rich text / markdown content |
| order_index | INT | | Display ordering (1, 2, 3...) |
| is_published | BOOLEAN | | Draft vs. visible to students |
| created_at | TIMESTAMPTZ | | Upload timestamp |

**classroom_quizzes**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | UUID | PK | Auto-generated |
| classroom_id | UUID | FK → classrooms.id | Which classroom |
| module_id | UUID | FK → classroom_modules.id | Optional: ties quiz to a specific module |
| title | TEXT | | Quiz title |
| description | TEXT | | Instructions or description |
| is_ai_generated | BOOLEAN | | True if created via AI from module content |
| time_limit_minutes | INT | | Optional time limit |
| is_published | BOOLEAN | | Draft vs. visible to students |
| created_at | TIMESTAMPTZ | | Creation timestamp |

**classroom_quiz_questions**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | UUID | PK | Auto-generated |
| quiz_id | UUID | FK → classroom_quizzes.id | Which quiz |
| question_text | TEXT | | The question prompt |
| question_type | TEXT | | 'multiple_choice', 'true_false', or 'short_answer' |
| options | JSONB | | Array of answer choice strings (for MC) |
| correct_answer | TEXT | | The correct answer |
| explanation | TEXT | | Explanation shown after answering |
| order_index | INT | | Display ordering |
| points | INT | | Point value (default 1) |

**classroom_quiz_attempts**
| Field | Data Type | PK / FK | Notes |
|-------|-----------|---------|-------|
| id | UUID | PK | Auto-generated |
| quiz_id | UUID | FK → classroom_quizzes.id | Which quiz |
| student_id | UUID | FK → profiles.id | Who submitted |
| answers | JSONB | | Student's submitted answers |
| score | INT | | Points earned |
| max_score | INT | | Total possible points |
| started_at | TIMESTAMPTZ | | When student started the quiz |
| submitted_at | TIMESTAMPTZ | | When student submitted |

---

## Schema Design Worksheet

### Fill in per entity:

| Entity Name | Purpose (1 sentence) | Key Attributes | Data Type | PK / FK |
|-------------|---------------------|----------------|-----------|---------|
| users | Stores authenticated user accounts via Supabase Auth | id, email, created_at | UUID, TEXT, TIMESTAMPTZ | PK: id |
| profiles | Stores user profile, progress, gamification, and role | id, username, role, character, avatar, xp, level, rank, streak | UUID, TEXT, INT, TEXT[], DATE | PK: id, FK: id → users |
| modules | Defines the 4 OS learning modules | module_id, title, module_order, statements | BIGSERIAL, TEXT, INT | PK: module_id |
| quizzes | One quiz per module with metadata | quiz_id, module_id, title, total_questions | BIGSERIAL, BIGINT, TEXT, INT | PK: quiz_id, FK: module_id → modules |
| questions | Individual MC questions within a quiz | question_id, quiz_id, question_text, options, correct_answer_index | BIGSERIAL, BIGINT, TEXT, JSONB, INT | PK: question_id, FK: quiz_id → quizzes |
| quiz_attempts | Records each student's quiz submission | attempt_id, user_id, quiz_id, score, passed | BIGSERIAL, UUID, BIGINT, INT, BOOL | PK: attempt_id, FK: user_id → users, quiz_id → quizzes |
| simulations | Defines the 10 interactive OS simulators | simulation_id, title, topic, max_bonus_xp | BIGSERIAL, TEXT, INT | PK: simulation_id |
| simulation_completions | Tracks sim clears with scores and bonus XP | completion_id, user_id, simulation_id, best_score, bonus_xp | BIGSERIAL, UUID, BIGINT, INT | PK: completion_id, FK: user_id → users, simulation_id → simulations |
| badges | Defines the 10 earnable badges | badge_id, name, icon, color, trigger_id | BIGSERIAL, TEXT | PK: badge_id |
| user_badges | Join table: users to earned badges | user_badge_id, user_id, badge_id, earned_at | BIGSERIAL, UUID, BIGINT, TIMESTAMPTZ | PK: user_badge_id, FK: user_id → users, badge_id → badges |
| user_progress | Per-module progress tracking | progress_id, user_id, module_id, progress_percentage | BIGSERIAL, UUID, BIGINT, DECIMAL | PK: progress_id, FK: user_id → users, module_id → modules |
| security_audit_log | Forensic trail for gameplay mutations | id, user_id, action, detail, ip_address | BIGSERIAL, UUID, TEXT, JSONB | PK: id, FK: user_id → users |
| classrooms | Professor-owned learning space | id, professor_id, name, join_code, is_active | UUID, TEXT, BOOL | PK: id, FK: professor_id → profiles |
| classroom_members | Students enrolled in a classroom | id, classroom_id, student_id, joined_at | UUID, TIMESTAMPTZ | PK: id, FK: classroom_id → classrooms, student_id → profiles |
| classroom_modules | Professor-uploaded lesson content | id, classroom_id, title, content, order_index | UUID, TEXT, INT | PK: id, FK: classroom_id → classrooms |
| classroom_quizzes | Professor or AI-generated quizzes | id, classroom_id, module_id, title, is_ai_generated | UUID, TEXT, BOOL | PK: id, FK: classroom_id → classrooms, module_id → classroom_modules |
| classroom_quiz_questions | Questions within a classroom quiz | id, quiz_id, question_text, options, correct_answer | UUID, TEXT, JSONB | PK: id, FK: quiz_id → classroom_quizzes |
| classroom_quiz_attempts | Student quiz submissions | id, quiz_id, student_id, answers, score, max_score | UUID, JSONB, INT | PK: id, FK: quiz_id → classroom_quizzes, student_id → profiles |

### Relationships:

| Entity A | Relationship | Entity B | Notes |
|----------|:---:|----------|-------|
| users | 1:1 | profiles | Auto-created via DB trigger on signup |
| modules | 1:1 | quizzes | Each module has exactly one quiz |
| quizzes | 1:N | questions | One quiz contains 5–25 questions |
| users | 1:N | quiz_attempts | One user can attempt many quizzes |
| quizzes | 1:N | quiz_attempts | One quiz attempted by many users |
| users | M:N | badges | Via `user_badges` join table |
| users | 1:N | simulation_completions | One user can clear many sims |
| simulations | 1:N | simulation_completions | One sim cleared by many users |
| users | 1:N | user_progress | One user has progress in many modules |
| modules | 1:N | user_progress | One module tracked by many users |
| users | 1:N | security_audit_log | One user has many audit events |
| profiles | 1:N | classrooms | One professor owns many classrooms |
| classrooms | M:N | profiles | Via `classroom_members` join table |
| classrooms | 1:N | classroom_modules | One classroom has many modules |
| classrooms | 1:N | classroom_quizzes | One classroom has many quizzes |
| classroom_modules | 1:N | classroom_quizzes | Quiz optionally tied to a module |
| classroom_quizzes | 1:N | classroom_quiz_questions | One quiz has many questions |
| classroom_quizzes | 1:N | classroom_quiz_attempts | One quiz has many submissions |
| profiles | 1:N | classroom_quiz_attempts | One student submits many attempts |

---

## Step 4: Map Relationships (15 min)

*(See Relationships table above)*

---

## Step 5: Build the ERD (20 min)

The ERD was built using **Mermaid.js** and is available at:

- **Interactive:** Paste the Mermaid code into [mermaid.live](https://mermaid.live)
- **Local viewer:** Open `erd-diagram.html` in any browser
- **DrawSQL:** Updated on [drawsql.app](https://drawsql.app)

The ERD shows:
- 18 tables with column names and types
- Primary keys (PK) clearly marked
- Foreign keys (FK) clearly marked
- Lines connecting related tables with cardinality labels (1:1, 1:N, M:N)

---

## Step 6: Peer Review (10 min)

**1. Is there a table that could be merged or split?**

The `profiles` table could be split — gamification fields (xp, level, rank, streak, badges) could live in a separate `gamification_stats` table. However, since every profile has exactly one set of stats (1:1 relationship), keeping them together avoids unnecessary JOINs and is simpler for queries. We chose to keep them merged.

**2. Is there any duplicated data that could cause inconsistency?**

Yes — `badges` (INT count) on `profiles` is derivable from `COUNT(*)` on `user_badges`. We keep it for fast reads (avoids a JOIN on every dashboard load), but the backend always updates both atomically to prevent inconsistency. The `level` and `rank` fields are also derived from `xp` but stored for the same performance reason — the backend recalculates them on every XP mutation.

**3. What happens if a related record is deleted — does the schema account for it?**

Yes. All foreign keys referencing `auth.users(id)` use `ON DELETE CASCADE`, so deleting a user automatically removes their profile, audit logs, quiz attempts, simulation completions, badges, and classroom memberships. Classroom tables also cascade — deleting a classroom removes its members, modules, quizzes, questions, and attempts.

**4. What's one query this schema would struggle to answer efficiently?**

"Show me the top 10 students ranked by total classroom quiz scores across all classrooms." This requires joining `classroom_quiz_attempts` → `classroom_members` → `profiles` and aggregating scores. We would add a composite index on `(student_id, score)` in `classroom_quiz_attempts` and potentially a materialized view for the classroom leaderboard if performance becomes an issue.

---

## Step 7: Revise & Present (10–15 min)

### System Purpose
OS Odyssey is a gamified Operating Systems learning platform with a classroom management system for professors.

### Key Tables
- **profiles** — Central table holding all user data, gamification stats, and role
- **classrooms** + **classroom_members** — Professor-student enrollment via invite codes
- **classroom_quizzes** + **classroom_quiz_questions** — AI-generatable quizzes
- **security_audit_log** — Tamper-proof forensic trail for all gameplay mutations

### One Interesting Design Decision
We use a **role-based access system** (`role` column on `profiles`) instead of separate professor/student tables. This means a professor is still a student — they can learn modules, earn badges, and compete on the leaderboard just like everyone else. The `role` field simply unlocks additional capabilities (creating classrooms, uploading modules, generating quizzes). An admin can promote any student to professor without migrating data between tables.

---

### Suggested Tools Used
- **Mermaid.js** — text-based ERD tool for building the diagram
- **drawSQL** — visual drag-and-drop ERD builder
- **Supabase** — PostgreSQL database with built-in Auth and RLS
