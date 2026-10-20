import dotenv from "dotenv";
import mongoose from "mongoose";
import Reminder from "../src/models/Reminder.js";
import User from "../src/models/User.js";

dotenv.config({ path: new URL("../.env.local", import.meta.url) });

const [emailArgument, ...flags] = process.argv.slice(2);
const email = emailArgument?.trim().toLowerCase();
const reset = flags.includes("--reset");
const seedTitlePrefix = "[Seed]";

if (!email || !email.includes("@")) {
  console.error("Usage: npm run seed:reminders -- <user-email> [--reset]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required. Configure it in server/.env.local or the environment.",
  );
  process.exit(1);
}

function dateFromToday(dayOffset, hour) {
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + dayOffset);
  dueAt.setHours(hour, 0, 0, 0);
  return dueAt;
}

const fixtures = [
  {
    title: "Review project milestones",
    description: "Check progress and note the next steps.",
    category: "Work",
    dayOffset: -5,
  },
  {
    title: "Send the weekly update",
    description: "Share a short update with the team.",
    category: "Work",
    dayOffset: -3,
  },
  {
    title: "Book a dentist appointment",
    description: "Call the clinic to find a suitable time.",
    category: "Health",
    dayOffset: -2,
  },
  {
    title: "Pick up the parcel",
    description: "Bring the collection code.",
    category: "Personal",
    dayOffset: -1,
  },
  {
    title: "Plan next week",
    description: "Choose the three most important tasks.",
    category: "Other",
    dayOffset: 1,
  },
  {
    title: "Water the plants",
    description: "Give the indoor plants a little care.",
    category: "Personal",
    dayOffset: 2,
  },
  {
    title: "Prepare presentation slides",
    description: "Add the latest project numbers.",
    category: "Work",
    dayOffset: 3,
  },
  {
    title: "Go for a long walk",
    description: "Take a break and get some fresh air.",
    category: "Health",
    dayOffset: 4,
  },
  {
    title: "Renew the library books",
    description: "Return or renew before the due date.",
    category: "Other",
    dayOffset: 5,
  },
  {
    title: "Review monthly budget",
    description: "Check subscriptions and upcoming bills.",
    category: "Personal",
    dayOffset: 7,
  },
  {
    title: "Finish reading chapter",
    description: "Continue from the bookmarked page.",
    category: "Other",
    dayOffset: -4,
    completed: true,
  },
  {
    title: "Submit expense report",
    description: "Attach receipts from the trip.",
    category: "Work",
    dayOffset: -2,
    completed: true,
  },
  {
    title: "Complete annual checkup",
    description: "Keep the appointment notes for reference.",
    category: "Health",
    dayOffset: 2,
    completed: true,
  },
  {
    title: "Organize desk",
    description: "Clear old notes and file important papers.",
    category: "Personal",
    dayOffset: 0,
    completed: true,
  },
  {
    title: "Choose a weekend recipe",
    description: "Save ingredients to the shopping list.",
    category: "Other",
    dayOffset: 8,
  },
  {
    title: "Back up laptop files",
    description: "Confirm the latest backup completed.",
    category: "Work",
    dayOffset: 10,
  },
  {
    title: "Stretch after work",
    description: "Try a short mobility routine.",
    category: "Health",
    dayOffset: 6,
  },
  {
    title: "Return borrowed book",
    description: "Leave it by the front door.",
    category: "Personal",
    dayOffset: -6,
  },
  {
    title: "Update portfolio notes",
    description: "Capture details from the recent project.",
    category: "Work",
    dayOffset: 11,
  },
  {
    title: "Sort old photos",
    description: "Pick a few favorites to keep.",
    category: "Other",
    dayOffset: 12,
  },
  {
    title: "Schedule a rest day",
    description: "Leave some open space in the calendar.",
    category: "Health",
    dayOffset: 14,
  },
  {
    title: "Check smoke alarm batteries",
    description: "Replace any batteries that are low.",
    category: "Personal",
    dayOffset: 9,
  },
  {
    title: "Prepare meeting agenda",
    description: "Add discussion points before the call.",
    category: "Work",
    dayOffset: 1,
  },
  {
    title: "Try a new walking route",
    description: "Explore a nearby park or trail.",
    category: "Health",
    dayOffset: 13,
  },
];

try {
  await mongoose.connect(process.env.DATABASE_URL);
  const user = await User.findOne({ email });
  if (!user)
    throw new Error(
      `No Daymark user found for ${email}. Sign in once before seeding reminders.`,
    );

  if (reset) {
    await Reminder.deleteMany({
      user: user._id,
      title: { $regex: /^\[Seed\]/ },
    });
  }

  const seededAt = new Date();
  const reminders = fixtures.map((fixture, index) => {
    const dueAt = dateFromToday(fixture.dayOffset, 9 + (index % 8));
    return {
      user: user._id,
      title: `${seedTitlePrefix} ${fixture.title}`,
      description: fixture.description,
      category: fixture.category,
      dueAt,
      completedAt: fixture.completed ? seededAt : null,
      // Prevent test fixtures from being picked up by the email scheduler.
      emailSentAt: seededAt,
    };
  });

  await Reminder.insertMany(reminders);
  console.log(
    `Added ${reminders.length} test reminders for ${email}${reset ? " (previous [Seed] reminders replaced)" : ""}.`,
  );
  console.log(
    "Seed reminders are prefixed with [Seed] and marked as email-handled to avoid sending test emails.",
  );
} catch (error) {
  console.error(`Reminder seeding failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
