import type { ResumeData } from '../components/Resume'

const resume: ResumeData = {
  name: 'Reid Collins',
  title: 'Senior Technical Program Manager / Backend Engineer',
  contact: {
    location: 'Brooklyn, NY',
    email: 'hire.reid.collins@gmail.com',
    linkedin: 'https://linkedin.com/in/reidcollins',
  },
  summary:
    'Senior Technical Program Manager and Backend Engineer with a hybrid background in software development and program leadership. Experienced leading large-scale platform migrations and building production systems on AWS, including backend services, data pipelines, and observability frameworks. Proven ability to drive complex initiatives while remaining hands-on.',
  skillCategories: [
    { category: 'Languages', items: ['Python', 'Perl', 'Ruby', 'Bash'] },
    { category: 'AWS', items: ['ECS/Fargate', 'Lambda', 'SQS', 'EventBridge', 'SageMaker', 'S3', 'Athena'] },
    { category: 'Data', items: ['MySQL', 'PostgreSQL', 'ClickHouse', 'Hive', 'DynamoDB'] },
    { category: 'Observability', items: ['Prometheus', 'Grafana', 'custom metrics', 'structured logging'] },
    { category: 'Tools', items: ['Git', 'Bitbucket', 'Jira', 'Confluence', 'Swagger/OpenAPI', 'Docker', 'GitHub Copilot', 'Cursor'] },
  ],
  experience: [
    {
      company: 'Marigold (acquired by Zeta Global)',
      role: 'Senior Technical Program Manager / Backend Engineer',
      period: '2021 — 2026',
      achievementGroups: [
        {
          heading: 'Program Leadership & Delivery',
          items: [
            'Led migration from Phabricator to Bitbucket across teams, including repo migration, branching redesign, and bot integration',
            'Led migration from on-prem Jira to Jira Cloud, defining scope, redesigning workflows, and managing contractor execution within budget',
            'Led team execution processes, including sprint planning, backlog grooming, and retrospectives; maintained Jira board accuracy and workflow discipline to improve delivery consistency in a Kanban environment',
          ],
        },
        {
          heading: 'Platform & Backend Systems',
          items: [
            'Implemented a containerized API proxy and token system, owning application logic and token workflows; partnered with SRE on ECS/Fargate deployment',
            'Led migration from Oracle to MySQL, including schema reconstruction, CSV-based data migration, removal of Oracle-specific constructs, and fallback sync mechanisms',
            'Supported migration of image caching from Akamai to Cloudflare via application changes and client certificate coordination',
            'Developed backend modules for authentication, campaign data, service health, DynamoDB integration, and high-throughput external platform communication',
            'Created Swagger/OpenAPI documentation and partnered with teams to support API integration',
          ],
        },
        {
          heading: 'Machine Learning / Data Platform',
          items: [
            'Contributed to a serverless ML pipeline for Propensity-to-Purchase using Lambda, SQS, EventBridge, and SageMaker',
            'Built data prep workflows using Athena, Feature Store, and S3; supported model training and inference',
            'Led client onboarding: defined data requirements, sourced historical data, mapped events to users, and backfilled Feature Store datasets',
          ],
        },
        {
          heading: 'Observability & Reliability',
          items: [
            'Built a custom observability framework (structured logging, tracing, Prometheus metrics), Grafana dashboards, and alerting integrations with monitoring teams',
          ],
        },
      ],
    },
    {
      company: 'Cheetah Digital',
      role: 'Technical Program Manager / Software Developer',
      period: '2015 — 2021',
      achievements: [
        'Scrum Master and technical contributor across engineering teams, supporting Agile delivery and sprint execution',
        'Coordinated engineering, SRE, and release teams to deliver platform improvements',
        'Contributed to backend systems and data processing pipelines',
        'Worked directly with clients on integrations and troubleshooting',
      ],
    },
    {
      company: 'CheetahMail / Experian',
      role: 'Software Developer',
      period: '2008 — 2015',
      achievements: [
        'Improved reporting performance using SQL*Loader to bulk-load high-volume data',
        'Built nightly ETL workflows for client data feeds (text/XML) into BerkeleyDB/CDB structures',
        'Supported client onboarding and API integrations with sales and technical teams',
      ],
    },
  ],
  education: [
    {
      school: 'Tulane University',
      degree: 'Bachelor of Arts, International Relations',
      period: '',
    },
  ],
}

export default resume
