"""
Fix Fake User Profiles
──────────────────────
Updates all dummy users to:
  1. Use the Kernel Penguin avatar
  2. Replace bot-like usernames (adjective_noun##) with natural-looking ones

Usage:
  python fix_fake_avatars.py
"""

import os
import re
import sys
import random
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    sys.exit(1)

PENGUIN_AVATAR = "../../assets/penguin-flower-removebg-preview.png"
PENGUIN_CHARACTER = "Kernel Penguin"

# Same name pools as bulk_add_users.py
FIRST_NAMES = [
    "angel", "mark", "john", "nicole", "james", "ara", "carl", "jai",
    "kath", "lance", "rhea", "paulo", "ella", "miko", "jasmine", "ken",
    "bea", "josh", "mae", "ivan", "trisha", "kyle", "aira", "renz",
    "cj", "yna", "hans", "diana", "zeke", "sam", "ria", "dan",
    "kim", "gab", "lea", "jm", "shaina", "alex", "mia", "jeff",
    "chel", "ram", "joy", "vince", "tina", "neil", "kate", "aj",
    "cess", "jed", "liz", "marco", "rose", "ben", "yza", "theo",
]

SECOND_PARTS = [
    "marie", "john", "rose", "jay", "ann", "lee", "mae", "rae",
    "grace", "james", "belle", "nicole", "lyn", "carl", "joy", "zen",
    "sky", "dean", "kai", "faye", "ella", "cruz", "santos", "reyes",
    "garcia", "lopez", "torres", "ramos", "dela", "bautista", "mendoza",
]

PREFIXES = ["itsme", "im", "hey", "the", "just", "hi", "yo", "real", "its", ""]
SUFFIXES = ["x", "xx", "xo", "oo", "ie", "ey", "z", "s", ""]


def generate_username():
    """Generate a natural-looking username."""
    style = random.randint(1, 6)
    first = random.choice(FIRST_NAMES)
    second = random.choice(SECOND_PARTS)

    if style == 1:
        num = random.choice(["", str(random.randint(1, 99)).zfill(random.choice([1, 2]))])
        return f"{first}{second}{num}"
    elif style == 2:
        prefix = random.choice(PREFIXES)
        num = random.choice(["", str(random.randint(1, 30))])
        return f"{prefix}{first}{num}"
    elif style == 3:
        suffix = random.choice(SUFFIXES)
        num = random.choice(["", str(random.randint(1, 99)).zfill(2)])
        return f"{first}{suffix}{num}"
    elif style == 4:
        num = random.choice([
            str(random.randint(1, 31)),
            str(random.randint(1, 12)).zfill(2),
            str(random.randint(2000, 2008)),
            str(random.randint(1, 99)).zfill(2),
        ])
        return f"{first}{num}"
    elif style == 5:
        short = random.choice(["cj", "jm", "aj", "rj", "dj", "mj", "jp", "jc"])
        return f"{short}{second}{random.choice(['', str(random.randint(1, 30))])}"
    else:
        num = random.choice(["", str(random.randint(1, 99))])
        return f"{first}{second}{num}"


def is_bot_username(username):
    """Detect the old adjective_noun## pattern."""
    return bool(re.match(r'^[a-z]+_[a-z]+\d+$', username or ''))


def main():
    admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    # Fetch all profiles
    result = admin.table("profiles").select("id, username, avatar, character").execute()
    profiles = result.data or []

    # Find fake users: non-penguin avatar OR bot-like username
    dummy_characters = ["Scheduler Scout", "Memory Monitor"]
    targets = [
        p for p in profiles
        if p.get("character") in dummy_characters or is_bot_username(p.get("username"))
    ]

    if not targets:
        print("No fake users to fix. Everything looks good!")
        return

    print(f"\nFixing {len(targets)} fake user(s)...\n")
    print("-" * 60)

    used_names = {p.get("username") for p in profiles}
    updated = 0

    for profile in targets:
        old_name = profile.get("username", "???")
        updates = {}

        # Fix avatar if needed
        if profile.get("character") in dummy_characters or profile.get("avatar") != PENGUIN_AVATAR:
            updates["character"] = PENGUIN_CHARACTER
            updates["avatar"] = PENGUIN_AVATAR

        # Fix bot-like username
        if is_bot_username(old_name):
            new_name = generate_username()
            while new_name in used_names:
                new_name = generate_username()
            updates["username"] = new_name
            used_names.add(new_name)

        if not updates:
            continue

        try:
            admin.table("profiles").update(updates).eq("id", profile["id"]).execute()
            new_name = updates.get("username", old_name)
            print(f"  [OK]  {old_name:<25} -> {new_name}")
            updated += 1
        except Exception as exc:
            print(f"  [FAIL] {old_name:<25} -- {exc}")

    print("-" * 60)
    print(f"\nDone! {updated} profile(s) fixed.\n")


if __name__ == "__main__":
    main()
