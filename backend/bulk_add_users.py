"""
Bulk Add Dummy Users Script
────────────────────────────
Creates fake users via the Supabase Admin API.
No real email accounts needed — users are auto-confirmed.
The database trigger (on_auth_user_created) will automatically
create the corresponding profiles rows.

Usage:
  1. Set how many dummy users you want (NUM_USERS below)
  2. Run:  python bulk_add_users.py
"""

import os
import sys
import random
import string
import time
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    sys.exit(1)

# ─── Configuration ──────────────────────────────────────

# How many dummy users to create
NUM_USERS = 20

# Fake email domain (doesn't need to exist)
FAKE_DOMAIN = "osodyssey-dummy.local"

# Default password for all dummy accounts
DUMMY_PASSWORD = "DummyUser123!"

# Characters to use for avatar selection (use only Kernel Penguin so fake users blend in)
CHARACTERS = [
    {"name": "Kernel Penguin", "avatar": "../../assets/penguin-flower-removebg-preview.png"},
]

# Name pools for generating natural-looking usernames
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
    """Generate a natural-looking username that mimics real student accounts."""
    style = random.randint(1, 6)

    first = random.choice(FIRST_NAMES)
    second = random.choice(SECOND_PARTS)

    if style == 1:
        # firstsecond + optional number: "angelrose05", "markjohn", "kathgrace23"
        num = random.choice(["", str(random.randint(1, 99)).zfill(random.choice([1, 2]))])
        return f"{first}{second}{num}"
    elif style == 2:
        # prefix + name: "itsmekai", "imjosh23", "heymia"
        prefix = random.choice(PREFIXES)
        num = random.choice(["", str(random.randint(1, 30))])
        return f"{prefix}{first}{num}"
    elif style == 3:
        # name + suffix + number: "kylexx", "rheas02", "lancez"
        suffix = random.choice(SUFFIXES)
        num = random.choice(["", str(random.randint(1, 99)).zfill(2)])
        return f"{first}{suffix}{num}"
    elif style == 4:
        # name + numbers: "james14", "ara2026", "nicole08"
        num = random.choice([
            str(random.randint(1, 31)),
            str(random.randint(1, 12)).zfill(2),
            str(random.randint(2000, 2008)),
            str(random.randint(1, 99)).zfill(2),
        ])
        return f"{first}{num}"
    elif style == 5:
        # initials or short: "cjramos", "ajcruz", "jmreyes"
        short = random.choice(["cj", "jm", "aj", "rj", "dj", "mj", "jp", "jc"])
        return f"{short}{second}{random.choice(['', str(random.randint(1, 30))])}"
    else:
        # firstlast style: "gabreyes", "kimtorres", "bencruz22"
        num = random.choice(["", str(random.randint(1, 99))])
        return f"{first}{second}{num}"


def generate_email(username):
    """Generate a fake email from the username."""
    return f"{username}@{FAKE_DOMAIN}"


# ─── Script ─────────────────────────────────────────────

def main():
    admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    success_count = 0
    fail_count = 0

    print(f"\nCreating {NUM_USERS} dummy user(s)...\n")
    print("-" * 55)

    for i in range(NUM_USERS):
        username = generate_username()
        email = generate_email(username)
        character = random.choice(CHARACTERS)

        try:
            # Create user via Admin API — auto-confirmed, no email sent
            result = admin.auth.admin.create_user({
                "email": email,
                "password": DUMMY_PASSWORD,
                "email_confirm": True,
            })

            if result.user:
                # Update the auto-created profile with a fun username and random character
                admin.table("profiles").update({
                    "username": username,
                    "character": character["name"],
                    "avatar": character["avatar"],
                    "level": random.randint(1, 5),
                    "xp": random.randint(20, 300),
                }).eq("id", result.user.id).execute()

                print(f"  [OK]    {username:<25} {email}")
                success_count += 1
            else:
                print(f"  [FAIL]  {username:<25} -- no user returned")
                fail_count += 1

            # Small delay to avoid rate limiting
            time.sleep(0.1)

        except Exception as exc:
            print(f"  [FAIL]  {username:<25} -- {exc}")
            fail_count += 1

    print("-" * 55)
    print(f"\nDone!  {success_count} created, {fail_count} failed.\n")


if __name__ == "__main__":
    main()
