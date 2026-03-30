import type { ResumeData } from '../components/Resume'

const resume: ResumeData = {
  name: 'Reid Collins',
  title: 'Senior Technical Program Manager / Backend Engineer',
  tagline: 'Open to Senior Technical Program Manager, Platform, and Infrastructure roles',
  contact: {
    location: 'Brooklyn, NY',
    email: 'hire.reid.collins@gmail.com',
    linkedin: 'https://linkedin.com/in/reidcollins',
  },
  summary:
    'Senior Technical Program Manager with a hybrid background in software engineering and program leadership. Proven track record of driving large-scale platform migrations, leading cross-functional initiatives, and delivering production systems on AWS.',
  skillCategories: [
    { category: 'Languages', items: ['Python', 'Perl', 'Ruby', 'Bash'] },
    { category: 'AWS', items: ['ECS/Fargate', 'Lambda', 'SQS', 'EventBridge', 'SageMaker', 'S3', 'Athena'] },
    { category: 'Data', items: ['MySQL', 'PostgreSQL', 'ClickHouse', 'Hive', 'DynamoDB'] },
    { category: 'Observability', items: ['Prometheus', 'Grafana', 'distributed tracing', 'structured logging'] },
    { category: 'Tools', items: ['Git', 'Bitbucket', 'Jira', 'Confluence', 'Swagger/OpenAPI', 'Docker', 'GitHub Copilot', 'Cursor'] },
    { category: 'Certifications', items: ['Certified Scrum Master (CSM)'] },
  ],
  timelineEntries: [
    { company: 'CheetahMail / Experian', role: 'Software Developer', period: '2008 — 2015' },
    { company: 'Cheetah Digital', role: 'Technical Program Manager / Software Developer', period: '2015 — 2021' },
    { company: 'Marigold (Zeta Global)', role: 'Senior TPM / Backend Engineer', period: '2021 — 2026' },
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
            'Led delivery of multiple cross-functional initiatives spanning engineering, SRE, and product teams, ensuring alignment, execution, and on-time delivery',
            'Led migration from Phabricator to Bitbucket across engineering, SRE, and client development teams (3 repositories), defining migration strategy, redesigning branching models, enabling automated commits via bot/service accounts, and improving code review quality and reducing production issues',
            'Directed migration from on-prem Jira to Jira Cloud across 20 projects and 15 teams, redefining workflows for cloud constraints and incompatible plugins, establishing ticket migration cutoffs, and managing external contractors within budget',
            'Established and enforced team execution processes (sprint planning, backlog grooming, retrospectives), improving delivery consistency and visibility in a Kanban environment',
          ],
        },
        {
          heading: 'Platform & Backend Systems',
          items: [
            'Developed a containerized API proxy and token management system on AWS ECS/Fargate, improving authentication reliability and service scalability',
            'Drove migration from Oracle to MySQL, including schema redesign, data migration strategy, and elimination of legacy database dependencies',
            'Coordinated migration of image caching infrastructure from Akamai to Cloudflare, aligning application changes and external dependencies',
            'Developed backend services for authentication, campaign data, service health, and DynamoDB integrations in high-throughput systems',
            'Defined API contracts using Swagger/OpenAPI to support cross-team and client integrations',
          ],
        },
        {
          heading: 'Machine Learning / Data Platform',
          items: [
            'Led onboarding of 100+ clients to ML platform over two quarters, designing ingestion pipelines using ClickHouse S3 integration and EventBridge to process multi-terabyte datasets (10–50GB per client)',
            'Partnered with Analytics to deliver nightly pipelines using Athena and S3, defining ClickHouse queries, implementing client-driven export controls via flag files, enabling cross-team S3 access via AWS SAM, and building monitoring to ensure reliable ingestion',
            'Contributed to delivery of Propensity-to-Purchase and Discount Optimization models via a serverless ML platform (Lambda, SQS, EventBridge, SageMaker), introducing a data assessment layer and partnering across teams to source higher-quality purchase data from distributed systems (ClickHouse, Hive)',
          ],
        },
        {
          heading: 'Observability & Reliability',
          items: [
            'Led development of a custom observability framework (structured logging, distributed tracing, Prometheus, Grafana) for high-throughput, time-sensitive systems processing thousands of messages per minute',
            'Improved system reliability and visibility across clients by enabling real-time monitoring, alerting, and faster issue detection and resolution',
          ],
        },
      ],
    },
    {
      company: 'Cheetah Digital',
      role: 'Technical Program Manager / Software Developer',
      period: '2015 — 2021',
      achievements: [
        'Led Agile delivery processes as Scrum Master across multiple engineering teams, improving planning accuracy and execution consistency',
        'Coordinated cross-functional efforts between engineering, SRE, and release teams to deliver platform enhancements',
        'Contributed to backend services and data processing systems supporting high-volume client workloads',
        'Partnered directly with clients to support integrations, troubleshoot issues, and ensure successful delivery',
      ],
    },
    {
      company: 'CheetahMail / Experian',
      role: 'Software Developer',
      period: '2008 — 2015',
      achievements: [
        'Joined CheetahMail as an early employee during startup funding rounds; grew with the company through its acquisition by Experian, transitioning from client services into engineering',
        'Scrum master and developer for Cheetahmail development team',
        'Improved reporting performance by implementing bulk data loading solutions using SQL*Loader for high-volume datasets',
        'Built ETL pipelines for client data ingestion (text/XML) into BerkeleyDB/CDB systems and supported API integrations',
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
