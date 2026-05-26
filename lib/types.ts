export const CSV_HEADER = [
  "Photo name",
  "Date",
  "Timestamp",
  "Species",
  "# Individuals",
  "Behavior",
] as const;

export type CsvRow = [
  string,
  string,
  string,
  string,
  string,
  string,
];

export type Behavior =
  | "foraging"
  | "moving"
  | "standing"
  | "resting"
  | "drinking"
  | "running"
  | "unknown"
  | "N/A";

export type LlmAnalysis = {
  species_common: string;
  individual_count: number;
  behavior: Behavior;
  has_animal: boolean;
  has_human: boolean;
};

export type FileJobStatus = "pending" | "analyzing" | "done" | "error";

export type FileJobState = {
  name: string;
  status: FileJobStatus;
  error?: string;
  row?: CsvRow;
};

export type JobStatus = "queued" | "running" | "completed" | "failed";

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
};
