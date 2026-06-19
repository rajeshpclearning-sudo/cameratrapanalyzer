export const CSV_HEADER = [
  "Photo Name",
  "Date",
  "Timestamp",
  "Species Name",
  "Number of Individuals",
  "Behavior",
  "Status",
] as const;

/** Column indices for CsvRow tuples */
export const CSV_COL = {
  photoName: 0,
  date: 1,
  timestamp: 2,
  speciesName: 3,
  individuals: 4,
  behavior: 5,
  status: 6,
} as const;

export type CsvRow = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export const ROW_STATUS = {
  success: "Success",
  error: "Error",
} as const;

export type LlmAnalysis = {
  species_common: string;
  individual_count: number;
  individuals_description: string;
  behavior: string;
  has_animal: boolean;
  has_human: boolean;
};

export type FileJobStatus =
  | "pending"
  | "analyzing"
  | "done"
  | "error"
  | "skipped";

export type JobStats = {
  emptySkipped: number;
  burstCopied: number;
  burstInferred: number;
  llmCalls: number;
};

export type FileJobState = {
  name: string;
  status: FileJobStatus;
  error?: string;
  row?: CsvRow;
};

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type JobSupabaseStatus = {
  saved: number;
  configured: boolean;
  error?: string;
};

/** Result from persistSightings / import API (safe for client types). */
export type PersistSightingsResult = {
  configured: boolean;
  inserted: number;
  error?: string;
};

export type Job = {
  id: string;
  status: JobStatus;
  total: number;
  completed: number;
  files: FileJobState[];
  errors: string[];
  csvContent?: string;
  downloadFilename: string;
  createdAt: number;
  stats?: JobStats;
  cancelRequested?: boolean;
  supabase?: JobSupabaseStatus;
};

export type JobPollResponse = {
  jobId: string;
  status: JobStatus;
  total: number;
  completed: number;
  files: FileJobState[];
  errors: string[];
  csvReady: boolean;
  downloadFilename: string;
  stats?: JobStats;
  supabase?: JobSupabaseStatus;
};
