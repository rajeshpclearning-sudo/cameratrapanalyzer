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

export function deleteOldJobs(maxAgeMs = 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > maxAgeMs) {
      jobs.delete(id);
    }
  }
}
