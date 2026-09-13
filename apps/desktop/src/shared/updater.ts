export interface UpdaterStatus {
  status: "available" | "up-to-date" | "downloading" | "ready" | "error";
  percent?: number;
  message?: string;
}
