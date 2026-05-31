import type { FileJobState, JobStatus } from "./types";

export type FileStatus = FileJobState["status"] | "ready";

export type FileStatusDisplay = {
  label: string;
  rowClass: string;
  badgeClass: string;
  icon: string;
  iconClass: string;
};

export function getFileStatusDisplay(
  status: FileStatus,
  jobStatus?: JobStatus,
): FileStatusDisplay {
  switch (status) {
    case "done":
      return {
        label: "Done",
        rowClass: "bg-surface-dim/50",
        badgeClass: "text-primary bg-primary/10",
        icon: "check_circle",
        iconClass: "text-primary text-sm",
      };
    case "skipped":
      return {
        label: jobStatus === "cancelled" ? "Stopped" : "Skipped",
        rowClass: "bg-surface-container-high/50",
        badgeClass:
          jobStatus === "cancelled"
            ? "text-on-surface-variant bg-surface-container-highest"
            : "text-on-surface-variant bg-surface-container-highest",
        icon: jobStatus === "cancelled" ? "stop_circle" : "hide_image",
        iconClass: "text-on-surface-variant text-sm",
      };
    case "analyzing":
      return {
        label: "Analyzing",
        rowClass: "bg-surface-container-high border-l-2 border-l-[#0091ff]",
        badgeClass: "text-[#0091ff] bg-[#0091ff]/10",
        icon: "sync",
        iconClass: "text-[#0091ff] text-sm animate-spin",
      };
    case "error":
      return {
        label: "Error",
        rowClass: "bg-error-container/10",
        badgeClass: "text-error bg-error/10",
        icon: "error",
        iconClass: "text-error text-sm",
      };
    case "pending":
      return {
        label: "Pending",
        rowClass: "bg-surface-dim/30",
        badgeClass: "text-on-surface-variant bg-surface-container-highest",
        icon: "pending",
        iconClass: "text-on-surface-variant text-sm",
      };
    default:
      return {
        label: "Ready",
        rowClass: "",
        badgeClass: "text-on-surface-variant bg-surface-container-highest",
        icon: "photo",
        iconClass: "text-on-surface-variant text-sm",
      };
  }
}

export type SessionStatusDisplay = {
  label: string;
  detail?: string;
  chipClass: string;
  icon: string;
};

export function getSessionStatusDisplay(
  poll: { status: JobStatus; completed: number; total: number } | null,
  submitting: boolean,
  stopping: boolean,
): SessionStatusDisplay | null {
  if (stopping) {
    return {
      label: "Stopping",
      detail: "Wrapping up current photos…",
      chipClass: "border-error/30 bg-error-container/10 text-error",
      icon: "hourglass_top",
    };
  }

  if (!poll) return null;

  switch (poll.status) {
    case "running":
    case "queued":
      if (!submitting) return null;
      return {
        label: poll.status === "queued" ? "Starting" : "Running",
        detail: `${poll.completed} of ${poll.total} processed`,
        chipClass: "border-[#0091ff]/40 bg-[#0091ff]/10 text-[#0091ff]",
        icon: "sync",
      };
    case "completed":
      return {
        label: "Complete",
        detail: `${poll.completed} of ${poll.total} processed`,
        chipClass: "border-primary/40 bg-primary/10 text-primary",
        icon: "check_circle",
      };
    case "cancelled":
      return {
        label: "Stopped",
        detail: `${poll.completed} of ${poll.total} before stop`,
        chipClass:
          "border-on-surface-variant/30 bg-surface-container-highest text-on-surface-variant",
        icon: "stop_circle",
      };
    case "failed":
      return {
        label: "Failed",
        detail: `${poll.completed} of ${poll.total} processed`,
        chipClass: "border-error/40 bg-error-container/20 text-error",
        icon: "error",
      };
    default:
      return null;
  }
}
