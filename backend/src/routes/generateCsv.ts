import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// ---------------------------------------------------------------------------
// Seed data pools
// ---------------------------------------------------------------------------
const USERS = [
  "alice.chen@corp.example.com",
  "bob.martinez@corp.example.com",
  "carol.johnson@corp.example.com",
  "david.kim@corp.example.com",
  "eve.nguyen@corp.example.com",
  "frank.okafor@corp.example.com",
  "grace.patel@corp.example.com",
  "henry.wu@corp.example.com",
];

const DEPARTMENTS = [
  "Engineering",
  "Finance",
  "Marketing",
  "Human Resources",
  "IT Operations",
  "Legal",
  "Sales",
];

const LOCATIONS = [
  "HQ - San Jose",
  "Branch - New York",
  "Branch - London",
  "Remote - VPN",
  "Branch - Chicago",
];

const LEGITIMATE_CATEGORIES = [
  "Business and Economy",
  "News and Media",
  "Education",
  "Health",
  "Finance",
  "Shopping and Auctions",
  "Sports",
  "Travel",
  "Technology",
  "Government",
  "Search Engines and Portals",
  "Social Networking",
  "Entertainment",
];

const LEGITIMATE_URLS = [
  "https://www.google.com/search?q=quarterly+report",
  "https://calendar.google.com/calendar/r",
  "https://mail.google.com/mail/u/0",
  "https://docs.google.com/document/d/1abc",
  "https://zoom.us/j/123456789",
  "https://slack.com/archives/CXYZ",
  "https://github.com/corp-org/internal-tools",
  "https://jira.corp.example.com/browse/ENG-123",
  "https://confluence.corp.example.com/pages",
  "https://www.linkedin.com/in/employee",
  "https://news.ycombinator.com",
  "https://stackoverflow.com/questions/123456",
  "https://aws.amazon.com/console",
  "https://portal.azure.com",
  "https://www.office.com",
];

const LEGITIMATE_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
];

const LEGITIMATE_APP_CLASSES = [
  "Web Browsing", "Business Application", "Cloud Storage", "Communication",
  "Collaboration", "Development", "Productivity",
];
const LEGITIMATE_APP_NAMES = [
  "General Browsing", "Google Workspace", "Microsoft 365", "Zoom",
  "Slack", "GitHub", "Jira", "Confluence", "AWS Console",
];

// ── Anomaly seed data ─────────────────────────────────────────────────────────
interface AnomalyTemplate {
  url: string;
  urlCategory: string;
  urlClass: string;
  threatName: string;
  threatSeverity: string;
  action: string;
  statusCode: string;
  dlpEngine: string;
  useragent: string;
  transactionSizeRange: [number, number];
  appName: string;
  appClass: string;
  requestMethod: string;
}

const ANOMALY_TEMPLATES: AnomalyTemplate[] = [
  {
    url: "http://malware-dist.ru/payload.exe",
    urlCategory: "Malware Sites",
    urlClass: "Security Risk",
    threatName: "Trojan.GenericKD.48291",
    threatSeverity: "Critical",
    action: "Blocked",
    statusCode: "403",
    dlpEngine: "",
    useragent: LEGITIMATE_USER_AGENTS[0],
    transactionSizeRange: [4096, 8192],
    appName: "Malware",
    appClass: "Malicious",
    requestMethod: "GET",
  },
  {
    url: "https://phishing-login.net/microsoft-secure-login",
    urlCategory: "Phishing",
    urlClass: "Security Risk",
    threatName: "Phishing.MicrosoftImitation.2024",
    threatSeverity: "Critical",
    action: "Allowed",
    statusCode: "200",
    dlpEngine: "",
    useragent: LEGITIMATE_USER_AGENTS[1],
    transactionSizeRange: [1024, 3000],
    appName: "Phishing",
    appClass: "Malicious",
    requestMethod: "GET",
  },
  {
    url: "https://hack-tools.io/sqlmap.tar.gz",
    urlCategory: "Hacking",
    urlClass: "Security Risk",
    threatName: "HackTool.Generic",
    threatSeverity: "High",
    action: "Blocked",
    statusCode: "403",
    dlpEngine: "",
    useragent: "curl/7.68.0",
    transactionSizeRange: [20000, 90000],
    appName: "Hacking Tool",
    appClass: "Malicious",
    requestMethod: "GET",
  },
  {
    url: "https://data-exfil.xyz/upload?token=abc123",
    urlCategory: "Newly Registered Domains",
    urlClass: "Suspicious Destinations",
    threatName: "",
    threatSeverity: "",
    action: "Allowed",
    statusCode: "200",
    dlpEngine: "Credit Card Number",
    useragent: "python-requests/2.28.0",
    transactionSizeRange: [500000, 2000000],
    appName: "Data Exfiltration",
    appClass: "Data Loss",
    requestMethod: "POST",
  },
  {
    url: "http://185.234.219.20:8080/cmd",
    urlCategory: "Botnet Addresses",
    urlClass: "Malicious Content",
    threatName: "Backdoor.CobaltStrike",
    threatSeverity: "Critical",
    action: "Blocked",
    statusCode: "403",
    dlpEngine: "",
    useragent: LEGITIMATE_USER_AGENTS[2],
    transactionSizeRange: [512, 2048],
    appName: "C2 Communication",
    appClass: "Malicious",
    requestMethod: "CONNECT",
  },
  {
    url: "https://spyware-tracker.com/collect?uid=user123",
    urlCategory: "Spyware/Adware",
    urlClass: "Security Risk",
    threatName: "Spyware.KeyLogger.Generic",
    threatSeverity: "High",
    action: "Blocked",
    statusCode: "403",
    dlpEngine: "",
    useragent: LEGITIMATE_USER_AGENTS[0],
    transactionSizeRange: [128, 1024],
    appName: "Spyware",
    appClass: "Malicious",
    requestMethod: "GET",
  },
  {
    url: "https://torrent-proxy.cc/announce",
    urlCategory: "Peer-to-Peer",
    urlClass: "Security Risk",
    threatName: "",
    threatSeverity: "Medium",
    action: "Blocked",
    statusCode: "403",
    dlpEngine: "",
    useragent: "BitTorrent/7.10.5",
    transactionSizeRange: [2048, 10000],
    appName: "P2P File Sharing",
    appClass: "Peer to Peer",
    requestMethod: "GET",
  },
  {
    url: "https://pastebin.com/raw/X9qMnP3z",
    urlCategory: "Newly Registered Domains",
    urlClass: "Data Loss",
    threatName: "",
    threatSeverity: "",
    action: "Allowed",
    statusCode: "200",
    dlpEngine: "Social Security Number",
    useragent: "wget/1.20.3",
    transactionSizeRange: [10000, 50000],
    appName: "Pastebin",
    appClass: "Data Loss",
    requestMethod: "GET",
  },
  {
    url: "https://cryptominer.cloud/miner.js",
    urlCategory: "Cryptocurrency",
    urlClass: "Security Risk",
    threatName: "CoinMiner.Generic",
    threatSeverity: "Medium",
    action: "Allowed",
    statusCode: "200",
    dlpEngine: "",
    useragent: LEGITIMATE_USER_AGENTS[3],
    transactionSizeRange: [50000, 200000],
    appName: "Cryptomining",
    appClass: "Malicious",
    requestMethod: "GET",
  },
  {
    url: "ftp://192.168.1.254/sensitive-docs.zip",
    urlCategory: "File Transfer Services",
    urlClass: "Data Loss",
    threatName: "",
    threatSeverity: "",
    action: "Allowed",
    statusCode: "200",
    dlpEngine: "PII - Sensitive Data",
    useragent: LEGITIMATE_USER_AGENTS[4],
    transactionSizeRange: [800000, 5000000],
    appName: "FTP",
    appClass: "Data Loss",
    requestMethod: "CONNECT",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomIp(): string {
  return `10.${randInt(0, 10)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

function randomDate(daysBack = 7): Date {
  const now = Date.now();
  const offset = Math.random() * daysBack * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

function formatDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// Escape CSV field (wrap in quotes if it contains comma, quote or newline)
function csvField(val: string | number): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Row generators
// ---------------------------------------------------------------------------
interface CsvRow {
  datetime: string;
  user: string;
  clientIp: string;
  url: string;
  action: string;
  urlCategory: string;
  urlClass: string;
  threatName: string;
  threatSeverity: string;
  department: string;
  transactionSize: number;
  requestMethod: string;
  statusCode: string;
  dlpEngine: string;
  useragent: string;
  location: string;
  appName: string;
  appClass: string;
}

function legitRow(): CsvRow {
  const txSize = randInt(512, 120_000);
  return {
    datetime: formatDatetime(randomDate()),
    user: pick(USERS),
    clientIp: randomIp(),
    url: pick(LEGITIMATE_URLS),
    action: "Allowed",
    urlCategory: pick(LEGITIMATE_CATEGORIES),
    urlClass: "Business Usage",
    threatName: "None",
    threatSeverity: "None",
    department: pick(DEPARTMENTS),
    transactionSize: txSize,
    requestMethod: pick(["GET", "POST", "HEAD"]),
    statusCode: pick(["200", "200", "200", "200", "301", "304", "206"]),
    dlpEngine: "",
    useragent: pick(LEGITIMATE_USER_AGENTS),
    location: pick(LOCATIONS),
    appName: pick(LEGITIMATE_APP_NAMES),
    appClass: pick(LEGITIMATE_APP_CLASSES),
  };
}

function anomalyRow(): CsvRow {
  const template = pick(ANOMALY_TEMPLATES);
  const [minTx, maxTx] = template.transactionSizeRange;
  return {
    datetime: formatDatetime(randomDate()),
    user: pick(USERS),
    clientIp: randomIp(),
    url: template.url,
    action: template.action,
    urlCategory: template.urlCategory,
    urlClass: template.urlClass,
    threatName: template.threatName,
    threatSeverity: template.threatSeverity,
    department: pick(DEPARTMENTS),
    transactionSize: randInt(minTx, maxTx),
    requestMethod: template.requestMethod,
    statusCode: template.statusCode,
    dlpEngine: template.dlpEngine,
    useragent: template.useragent,
    location: pick(LOCATIONS),
    appName: template.appName,
    appClass: template.appClass,
  };
}

// ---------------------------------------------------------------------------
// Build CSV string
// ---------------------------------------------------------------------------
const HEADERS = [
  "datetime",
  "user",
  "ClientIP",
  "url",
  "action",
  "urlcategory",
  "urlclass",
  "threatname",
  "threatseverity",
  "department",
  "transactionsize",
  "requestmethod",
  "status",
  "dlpengine",
  "useragent",
  "location",
  "appname",
  "appclass",
] as const;

function buildCsv(rowCount: number): string {
  const lines: string[] = [HEADERS.join(",")];

  // Ensure at least 25% anomalies
  const anomalyCount = Math.max(
    Math.ceil(rowCount * 0.25),
    Math.floor(rowCount * 0.40)
  );
  const legitCount = rowCount - anomalyCount;

  const rows: CsvRow[] = [];
  for (let i = 0; i < legitCount; i++) rows.push(legitRow());
  for (let i = 0; i < anomalyCount; i++) rows.push(anomalyRow());

  // Shuffle so anomalies aren't all at the end
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  // Sort by datetime ascending (feels more realistic)
  rows.sort(
    (a, b) =>
      new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  );

  for (const r of rows) {
    lines.push(
      [
        csvField(r.datetime),
        csvField(r.user),
        csvField(r.clientIp),
        csvField(r.url),
        csvField(r.action),
        csvField(r.urlCategory),
        csvField(r.urlClass),
        csvField(r.threatName),
        csvField(r.threatSeverity),
        csvField(r.department),
        csvField(r.transactionSize),
        csvField(r.requestMethod),
        csvField(r.statusCode),
        csvField(r.dlpEngine),
        csvField(r.useragent),
        csvField(r.location),
        csvField(r.appName),
        csvField(r.appClass),
      ].join(",")
    );
  }

  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------
export async function generateCsvRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/generate-sample-csv?rows=200
   * Returns a downloadable Zscaler-format CSV with mixed legit + anomaly rows.
   */
  app.get(
    "/api/generate-sample-csv",
    {
      schema: {
        tags: ['upload'],
        summary: 'Generate a sample Zscaler CSV file for testing',
        security: [],
        querystring: {
          type: 'object',
          properties: {
            rows: {
              type: 'string',
              description: 'Number of rows to generate (50–2000, default 200)',
              default: '200',
            },
          },
        },
        response: {
          200: {
            description: 'CSV file download',
            type: 'string',
            // content-type: text/csv handled by the route
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { rows?: string };
      }>,
      reply: FastifyReply
    ) => {
      const rowCount = Math.min(
        2000,
        Math.max(50, parseInt(request.query.rows ?? "200", 10))
      );

      const csv = buildCsv(rowCount);

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      return reply
        .status(200)
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="zscaler_sample_${timestamp}.csv"`
        )
        .header("Cache-Control", "no-cache")
        .send(csv);
    }
  );
}
