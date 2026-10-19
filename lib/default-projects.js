import { sql } from './db.js';
import { ensureSiteSettingsTable } from './site-settings.js';

// These entries predate the project admin. They are imported once so the
// public page and admin dashboard use the same source of truth from then on.
export const DEFAULT_PROJECTS = Object.freeze([
  {
    name: 'Tether / NeoNet',
    subtitle: 'A private desktop space for messages, a lasting inbox, and file exchange across trusted devices.',
    githubUrl: null,
    additionalLinks: [{ label: 'Download', url: 'https://www.basanta.cc/tether/' }],
    categories: ['Desktop', 'Rust', 'Networking']
  },
  {
    name: 'Portfolio (to be finished)',
    subtitle: 'Personal portfolio and landing page. Where I showcase who I am and what I build. Simple. Direct. Me.',
    githubUrl: null,
    additionalLinks: [{ label: 'Visit', url: 'https://www.basanta.cc/' }],
    categories: ['HTML/CSS', 'Portfolio']
  },
  {
    name: 'Hackclub Shanti (In Development)',
    subtitle: "Official website for our school's coding community. Events. Projects. Members. Where builders meet and collaborate.",
    githubUrl: 'https://github.com/orgs/Hackclub-Shanti',
    additionalLinks: [{ label: 'Visit', url: 'https://shantihacks.org/' }],
    categories: ['HTML/CSS', 'Community']
  },
  {
    name: 'Retrohouse',
    subtitle: '90s-inspired blog celebrating retro web aesthetics. Neon colors. Animated GIFs. Nostalgic vibes. Pure chaos.',
    githubUrl: 'https://github.com/basanta-bhandari/Olympics',
    additionalLinks: [],
    categories: ['HTML/CSS', '90s Design', 'Nostalgia']
  },
  {
    name: 'Pytype',
    subtitle: 'Python/curses type checking and validation software: Monkeytype in a terminal.',
    githubUrl: 'https://github.com/basanta-bhandari/Pytype',
    additionalLinks: [{ label: 'PyPI', url: 'https://pypi.org/project/Pytype-B1/' }],
    categories: ['Python', 'Typing Test', 'Package']
  },
  {
    name: 'PyDOS',
    subtitle: 'DOS emulator for the modern terminal, with a package manager and web tools.',
    githubUrl: 'https://github.com/basanta-bhandari/PY_DOS',
    additionalLinks: [{ label: 'PyPI', url: 'https://pypi.org/project/Py-DOS-B1/' }],
    categories: ['Python', 'Emulator', 'Terminal']
  },
  {
    name: 'Terminal Speil',
    subtitle: 'CLI D&D-esque game built for Summer of Making. Strategic and narrative-driven.',
    githubUrl: 'https://github.com/basanta-bhandari/Summer_of_Making',
    additionalLinks: [],
    categories: ['Python', 'Game', 'CLI']
  },
  {
    name: 'Pomodoro CLI',
    subtitle: 'Lightweight terminal-based pomodoro timer that works offline and needs no mouse.',
    githubUrl: 'https://github.com/basanta-bhandari',
    additionalLinks: [],
    categories: ['Python', 'Productivity', 'Timer']
  },
  {
    name: 'Lantern',
    subtitle: 'Yggdrasil-based mesh E2E CLI messaging network tool inspired by Mutiny from Halt & Catch Fire.',
    githubUrl: null,
    additionalLinks: [{ label: 'View', url: 'https://pypi.org/user/basantabh/' }],
    categories: ['Python', 'Networking', 'E2E Messaging']
  },
  {
    name: '404 Experience',
    subtitle: 'Creative error page. When things break, make it memorable.',
    githubUrl: null,
    additionalLinks: [{ label: 'View', url: 'https://github.com/basanta-bhandari' }],
    categories: ['HTML/CSS', 'Interaction']
  },
  {
    name: 'Distrohopper',
    subtitle: 'Distrohopping script builder for popular Debian-based distros.',
    githubUrl: null,
    additionalLinks: [{ label: 'View', url: 'https://github.com/basanta-bhandari' }],
    categories: ['Web', 'Debian', 'Automation']
  },
  {
    name: 'RefDek',
    subtitle: 'A reference deck for maintaining bibliography and glossary entries with descriptions and categories.',
    githubUrl: null,
    additionalLinks: [{ label: 'View', url: 'https://github.com/basanta-bhandari' }],
    categories: ['Web', 'Research', 'Knowledge Base']
  },
  {
    name: 'Termui',
    subtitle: 'A TUI tool launcher with sudo password caching, custom tool addition, and automatic package-manager detection.',
    githubUrl: null,
    additionalLinks: [{ label: 'View', url: 'https://pypi.org/user/basantabh/' }],
    categories: ['Python', 'TUI', 'CLI']
  },
  {
    name: 'Discord Bot',
    subtitle: 'Custom Discord bot for management and automation for our server.',
    githubUrl: 'https://github.com/basanta-bhandari',
    additionalLinks: [],
    categories: ['Python', 'Discord', 'Bot']
  },
  {
    name: 'Hackatime Figma Plugin',
    subtitle: 'Figma plugin integration with Hackatime for the desktop application.',
    githubUrl: 'https://github.com/basanta-bhandari/Hackatime',
    additionalLinks: [],
    categories: ['JavaScript', 'Figma', 'Plugin']
  },
  {
    name: 'AoPS Enhanced Learning',
    subtitle: 'Art of Problem Solving platform enhancement with mastery filters and visual analytics.',
    githubUrl: 'https://github.com/basanta-bhandari',
    additionalLinks: [],
    categories: ['Browser Extension', 'Analytics', 'Mathematics']
  },
  {
    name: 'Coming Soon!',
    subtitle: 'Do you like maths?',
    githubUrl: null,
    additionalLinks: [{ label: 'Coming', url: 'https://github.com/basanta-bhandari' }],
    categories: ['Math', 'JavaScript', '???']
  }
]);

let seedPromise;

export async function ensureDefaultProjects() {
  if (!seedPromise) {
    seedPromise = (async () => {
      await ensureSiteSettingsTable();
      const seedRows = DEFAULT_PROJECTS.map(project => ({
        name: project.name,
        subtitle: project.subtitle,
        github_url: project.githubUrl,
        additional_links: project.additionalLinks,
        categories: project.categories
      }));

      // Claiming the version and inserting the projects happen in one query.
      // Concurrent first requests therefore cannot create duplicate projects.
      await sql`
        WITH seed_claim AS (
          INSERT INTO site_settings (key, value, updated_at)
          VALUES ('default_projects_v1', ${JSON.stringify({ seeded: true })}::jsonb, now())
          ON CONFLICT (key) DO NOTHING
          RETURNING key
        ), seed_projects AS (
          SELECT item.value AS project, item.ordinality AS position
          FROM jsonb_array_elements(${JSON.stringify(seedRows)}::jsonb)
            WITH ORDINALITY AS item(value, ordinality)
        )
        INSERT INTO projects (
          name, subtitle, github_url, additional_links, categories, created_at
        )
        SELECT
          project->>'name',
          project->>'subtitle',
          NULLIF(project->>'github_url', ''),
          project->'additional_links',
          project->'categories',
          now() - ((position - 1) * interval '1 millisecond')
        FROM seed_projects
        WHERE EXISTS (SELECT 1 FROM seed_claim)
          AND NOT EXISTS (
            SELECT 1 FROM projects existing
            WHERE lower(existing.name) = lower(project->>'name')
          )
      `;
    })();
  }

  try {
    await seedPromise;
  } catch (error) {
    seedPromise = null;
    throw error;
  }
}
