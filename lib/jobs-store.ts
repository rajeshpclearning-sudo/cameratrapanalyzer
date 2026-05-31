import type { Job } from "./types";

const jobs = new Map<string, Job>();

export function createJob(job: Job): void {
  jobs.set(job.id, job);
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  const updated = { ...job, ...patch };
  jobs.set(id, updated);
  return updated;
}

export function requestJobCancel(id: string): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled"
  ) {
    return job;
  }
  const updated = { ...job, cancelRequested: true };
  jobs.set(id, updated);
  return updated;
}

export function isJobCancelRequested(id: string): boolean {
  return getJob(id)?.cancelRequested === true;
}

export function deleteOldJobs(maxAgeMs = 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > maxAgeMs) {
      jobs.delete(id);
    }
  }
}
