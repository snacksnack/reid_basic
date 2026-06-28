import type { ResumeData } from '../components/Resume'

const resume: ResumeData = {
  name: 'Reid Collins',
  title: 'Senior Technical Program Manager / Software Developer',
  contact: {
    location: 'Brooklyn, NY',
    email: 'hire.reid.collins@gmail.com',
    website: 'https://hihelloreid.com',
    linkedin: 'https://linkedin.com/in/reidcollins',
    github: 'https://github.com/snacksnack',
  },
  summary:
    'Senior Technical Program Manager / Software Developer with a hybrid background in software engineering, program leadership, and client-facing technical delivery. Proven track record of driving large-scale platform migrations, leading cross-functional initiatives, translating business requirements into production systems, and delivering scalable solutions on AWS.',
  skillCategories: [
    { category: 'Languages', items: ['Python', 'Ruby', 'Perl', 'Bash'] },
    { category: 'AWS', items: ['ECS/Fargate', 'Lambda', 'SQS', 'EventBridge', 'SageMaker', 'S3', 'Athena'] },
    { category: 'Data', items: ['MySQL', 'PostgreSQL', 'ClickHouse', 'Hive', 'DynamoDB'] },
    { category: 'Observability', items: ['Prometheus', 'Grafana', 'distributed tracing', 'structured logging'] },
    { category: 'Tools', items: ['Git (Bitbucket, Github)', 'Jira', 'Confluence', 'Swagger/OpenAPI', 'Docker', 'Cursor', 'Notion', 'n8n'] },
    { category: 'Certifications', items: ['AWS Solutions Architect – Associate', 'Certified Scrum Master (CSM)'] },
  ],
  experience: [
    {
      company: 'Marigold (acquired by Zeta Global)',
      role: 'Senior Technical Program Manager / Software Developer',
      period: '2021 — 2026',
      achievementGroups: [
        {
          heading: 'Program Leadership & Delivery',
          items: [
            'Led migration from Phabricator to Bitbucket across engineering, SRE, and client development teams (3 repositories), defining migration strategy, redesigning branching models, enabling automated commits via bot/service accounts, and enforcing mandatory code review on all commits to reduce production issues by 20%',
            'Directed migration from on-prem Jira to Jira Cloud across 20 projects and 15 teams, redefining workflows for cloud constraints and incompatible plugins, establishing ticket migration cutoffs, and managing external contractors within budget',
            'Established team execution processes and built Jira/Notion/n8n automation workflows for delivery tracking, stakeholder reporting, and stale-ticket visibility, saving ~2 hours per week of manual reporting and cutting stale tickets by a fifth',
          ],
        },
        {
          heading: 'Machine Learning / Data Platform',
          items: [
            'Led onboarding of 100+ clients to ML platform over two quarters, translating client data requirements into ingestion pipelines using ClickHouse S3 integration and EventBridge to process multi-terabyte datasets (10–50GB per client), reducing average client onboarding time by 30%',
            'Engineered nightly data pipelines with Analytics using Athena and S3, coding ClickHouse queries, implementing client-driven export controls via flag files, enabling cross-team S3 access via AWS SAM, and building monitoring to ensure reliable ingestion',
            'Drove cross-functional delivery of Propensity-to-Purchase and Discount Optimization models via a serverless ML platform (Lambda, SQS, EventBridge, SageMaker), coding a data assessment layer shipped to production and coordinating teams to source higher-quality purchase data from distributed systems (ClickHouse, Hive)',
          ],
        },
        {
          heading: 'Platform & Backend Systems',
          items: [
            'Developed a containerized API proxy and token management system on AWS ECS/Fargate, improving authentication reliability and horizontal scalability — sustaining a 400K messages/hour SLA (100K per container across 4 containers)',
            'Drove zero-downtime migration from Oracle to MySQL, including schema redesign, data migration strategy, and implementing code changes to eliminate legacy database dependencies, eliminating over $100K in annual Oracle licensing and support costs',
            'Coordinated seamless migration of image caching infrastructure from Akamai to Cloudflare across 125 client domains, updating application code and partnering with clients to manage certificate changes with zero service disruption',
            'Developed backend services for authentication, campaign data, service health, and DynamoDB integrations in high-throughput systems',
            'Defined API contracts using Swagger/OpenAPI to support cross-team and client-facing integrations, improving implementation clarity across engineering, SRE, and partner teams',
          ],
        },
        {
          heading: 'Observability & Reliability',
          items: [
            'Led development of a custom observability framework (structured logging, distributed tracing, Prometheus, Grafana) for high-throughput, time-sensitive systems processing thousands of event-based messages per minute',
            'Built AI-powered incident summarization system using AWS Lambda, SAM, DynamoDB, Claude, Slack, and Jira to ingest alerts from CloudWatch, Datadog, and GitHub Actions, consolidating repeat alerts from the same failing service into single incidents and generating operational summaries — cutting post-mortem turnaround from days to hours',
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
        'Built backend services and data-processing systems supporting high-volume client workloads',
        'Partnered directly with enterprise clients to scope integrations, troubleshoot data and workflow issues, and translate client requirements into backend delivery plans',
      ],
    },
    {
      company: 'CheetahMail / Experian',
      role: 'Software Developer / Client Solutions Team',
      period: '2008 — 2015',
      achievements: [
        'Served as developer and Scrum Master across product development and client solutions teams, partnering with clients, account teams, and engineering to deliver custom technical solutions',
        'Designed and implemented client-specific remarketing and personalization campaigns using behavioral data from Coremetrics, Google Analytics, and Omniture, including abandoned-cart and browse-recovery workflows',
        'Built automated ETL pipelines to ingest, parse, validate, and transform client data feeds in text and XML formats into BerkeleyDB/CDB-backed systems',
        'Integrated client imports, exports, and APIs, translating business requirements into scalable data workflows and third-party platform integrations',
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
