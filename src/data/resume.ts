import type { ResumeData } from '../components/Resume'

const resume: ResumeData = {
  name: 'Reid Collins',
  title: 'Technical Program Manager',
  contact: {
    location: 'Brooklyn, New York',
    email: 'hihelloreid@gmail.com',
    phone: '646-250-2869',
    website: 'https://hihelloreid.com',
  },
  summary:
    'Technical Program Manager and former software developer with deep experience in Agile delivery, roadmap execution, and platform reliability. Blends hands-on coding with program leadership to align engineering work to business priorities and keep complex systems stable and efficient.',
  skills: [
    'Perl',
    'Python',
    'Ruby',
    'Bash',
    'MySQL',
    'Hive',
    'SQL*Loader',
    'Postgres',
    'MongoDB',
    'SDLC',
    'Scrum (CSM)',
    'Kanban',
    'Jira',
    'Confluence',
    'Bitbucket',
    'OpsGenie',
    'Heroku',
    'AWS (EC2 & S3)',
    'Git',
    'Puppet',
  ],
  experience: [
    {
      company: 'Cheetah Digital',
      role: 'Technical Program Manager',
      period: '2019 — Present',
      summary:
        'Own day-to-day Agile delivery and program execution for the Cheetahmail platform; ensure work aligns with roadmap priorities and critical client needs.',
      achievements: [
        'Facilitated Scrum for platform team: 95% ceremony attendance; sprint predictability improved from ~65% to ~88% over 2 quarters.',
        'Contributed hands-on code during peak demand, accelerating delivery of urgent fixes by ~20% average time saved per incident.',
        'Partnered with SRE to harden reliability; change failure rate reduced by ~30% and p95 API latency improved by ~18%.',
        'Delivered cross-platform data flow initiatives, cutting manual handoffs by ~40% through automation.',
        'Led Holiday SWAT program; zero P1s across Black Friday/Cyber Monday and <0.2% error rate during peak traffic.',
      ],
    },
    {
      company: 'Cheetah Digital',
      role: 'Software Developer / Scrum Master',
      period: '2015 — 2019',
      achievements: [
        'Led two teams through Waterfall→Scrum transition; increased throughput ~25% and decreased average cycle time ~22%.',
        'Drove full ceremonies cadence and backlog hygiene; reduced rollover stories by ~35%.',
        'Partnered with release/network/DB teams to streamline deployments; cut change lead time by ~28%.',
        'Handled urgent client escalations; restored service or shipped mitigations within SLA in >90% of cases.',
        'Took on development tasks to unblock teams; shaved ~10–15% off critical-path timelines when engaged.',
      ],
    },
    {
      company: 'Bespoke Global',
      role: 'Software Developer (Contract)',
      period: 'March 2014',
      achievements: [
        'Shipped multi-step checkout redesign; reduced checkout abandonment by an estimated ~8–12%.',
        'Introduced state machine validation; decreased invalid submissions and support tickets ~20%.',
        'Built HAML partials and refined product display logic; improved page-to-page consistency and performance.',
      ],
    },
    {
      company: 'Cheetahmail (Experian)',
      role: 'Software Developer, Platform Team',
      period: '2011 — 2013',
      achievements: [
        'Enabled faster marketing reporting via SQL*Loader ingestion of high-volume data; cut processing times by ~35–50%.',
        'Implemented Memcached; reduced DB queries on hot paths by ~60% and improved page render times ~25–30%.',
        'Completed XSS audit and fixes; reduced security findings to zero blocking issues for renewals.',
        'Partnered with QA/Release to create rollout tests; decreased rollback frequency by ~20%.',
      ],
    },
    {
      company: 'Cheetahmail (Experian)',
      role: 'Software Developer, Client Development Team',
      period: '2008 — 2010',
      achievements: [
        'Launched data-driven remarketing; increased campaign conversions by an estimated ~10–15% across pilots.',
        'Automated inventory feed conversion to CDB/BerkeleyDB; removed manual steps and cut processing time by hours daily.',
        'Built automated subscriber attrition reporting; improved list quality and targeting decisions.',
        'Delivered import/export integrations; provided daily/weekly/monthly/quarterly metric aggregation.',
        'Joined sales calls as technical SME; accelerated onboarding for new clients to API suite.',
      ],
    },
  ],
  education: [
    {
      school: 'Tulane University',
      degree: 'Bachelor of Arts — International Relations',
      period: 'Graduated 05/1998',
    },
  ],
  links: [
    { label: 'Personal Site', url: 'https://hihelloreid.com' },
    { label: 'Resume (PDF)', url: '/docs/reidcollins.pdf' },
  ],
}

export default resume


