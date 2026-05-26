import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { uploadDocument } from "@/lib/documents.functions";
import { toast } from "sonner";
import { finToast } from "@/lib/fin-toast";

export type UploadItemStatus = "pending" | "uploading" | "done" | "failed" | "rejected";

export type UploadItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  mime: string;
  status: UploadItemStatus;
  message?: string;
  ocrStatus?: string;
  detectedKind?: string;
  tenantMatch?: "ok" | "warn" | "reject" | "skip";
  tenantMatchReason?: string;
  startedAt?: number;
  finishedAt?: number;
};

export type UploadJob = {
  id: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  docKind: string;
  notes?: string;
  items: UploadItem[];
  status: "running" | "done";
};

type Ctx = {
  jobs: UploadJob[];
  enqueue: (opts: { files: File[]; docKind: string; notes?: string }) => string;
  dismiss: (jobId: string) => void;
  dismissAllDone: () => void;
  retryItem: (jobId: string, itemId: string) => void;
  dockOpen: boolean;
  setDockOpen: (o: boolean) => void;
  dockExpanded: boolean;
  setDockExpanded: (o: boolean) => void;
};

const UploadQueueContext = createContext<Ctx | null>(null);

const MAX_CONCURRENCY = 4;

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

async function fileToBase64(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  let s = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const upload = useServerFn(uploadDocument);
  const qc = useQueryClient();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dockOpen, setDockOpen] = useState(true);
  const [dockExpanded, setDockExpanded] = useState(true);
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleInvalidate = useCallback(() => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["sales-documents"] });
      qc.invalidateQueries({ queryKey: ["purchase-documents"] });
      qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
    }, 800);
  }, [qc]);

  const patchItem = useCallback((jobId: string, itemId: string, patch: Partial<UploadItem>) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id !== jobId
          ? j
          : { ...j, items: j.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) },
      ),
    );
  }, []);

  const finalizeJob = useCallback((jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        const done = j.items.filter((i) => i.status === "done").length;
        const failed = j.items.filter((i) => i.status === "failed").length;
        const rejected = j.items.filter((i) => i.status === "rejected").length;
        const total = j.items.length;
        const parts = [`Đã tải ${done}/${total} file`];
        if (failed) parts.push(`${failed} lỗi`);
        if (rejected) parts.push(`${rejected} bị từ chối`);
        const msg = parts.join(" · ");
        if (failed > 0 || rejected > 0) toast.error(msg);
        else finToast.success(msg);
        return { ...j, status: "done", finishedAt: Date.now() };
      }),
    );
  }, []);

  const runItem = useCallback(
    async (jobId: string, itemId: string, docKind: string, notes: string | undefined) => {
      const job = jobsRef.current.find((j) => j.id === jobId);
      const it = job?.items.find((i) => i.id === itemId);
      if (!it) return;
      patchItem(jobId, itemId, { status: "uploading", startedAt: Date.now() });
      try {
        const b64 = await fileToBase64(it.file);
        const res: any = await upload({
          data: {
            fileBase64: b64,
            filename: it.file.name,
            mimeType: it.file.type || "application/octet-stream",
            doc_kind: docKind as any,
            notes: notes || undefined,
          },
        });
        const isRejected = res?.ocr_status === "rejected";
        if (isRejected) {
          patchItem(jobId, itemId, {
            status: "rejected",
            ocrStatus: "rejected",
            detectedKind: res?.doc_kind,
            tenantMatch: "reject",
            tenantMatchReason: res?.rejection?.reason ?? "Không thuộc tổ chức",
            message: res?.rejection?.reason ?? "Tài liệu không thuộc tổ chức đang hoạt động",
            finishedAt: Date.now(),
          });
        } else {
          patchItem(jobId, itemId, {
            status: res?.ocr_status === "failed" ? "failed" : "done",
            ocrStatus: res?.ocr_status,
            detectedKind: res?.doc_kind,
            tenantMatch: res?.tenant_match,
            tenantMatchReason: res?.tenant_match_reason,
            message:
              res?.ocr_status === "failed"
                ? "OCR lỗi — có thể chạy lại ở chi tiết"
                : res?.tenant_match === "warn"
                  ? res?.tenant_match_reason
                  : undefined,
            finishedAt: Date.now(),
          });
        }
      } catch (e: any) {
        patchItem(jobId, itemId, {
          status: "failed",
          message: e?.message ?? "Lỗi",
          finishedAt: Date.now(),
        });
      }
      scheduleInvalidate();
    },
    [patchItem, scheduleInvalidate, upload],
  );

  const jobsRef = useRef<UploadJob[]>([]);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const runJob = useCallback(
    async (jobId: string) => {
      const job = jobsRef.current.find((j) => j.id === jobId);
      if (!job) return;
      const queue = [...job.items.map((i) => i.id)];
      let cursor = 0;
      const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, async () => {
        while (true) {
          const my = cursor++;
          if (my >= queue.length) return;
          await runItem(jobId, queue[my], job.docKind, job.notes);
        }
      });
      await Promise.all(workers);
      finalizeJob(jobId);
    },
    [runItem, finalizeJob],
  );

  const enqueue = useCallback<Ctx["enqueue"]>(
    ({ files, docKind, notes }) => {
      const jobId = `job_${Date.now()}_${rid()}`;
      const items: UploadItem[] = files.map((f) => ({
        id: `it_${rid()}`,
        file: f,
        name: f.name,
        size: f.size,
        mime: f.type || "application/octet-stream",
        status: "pending",
      }));
      const job: UploadJob = {
        id: jobId,
        createdAt: Date.now(),
        startedAt: Date.now(),
        docKind,
        notes,
        items,
        status: "running",
      };
      setJobs((prev) => [...prev, job]);
      setDockOpen(true);
      setDockExpanded(true);
      setTimeout(() => runJob(jobId), 0);
      return jobId;
    },
    [runJob],
  );

  const dismiss = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId || j.status === "running"));
  }, []);

  const dismissAllDone = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === "running"));
  }, []);

  const retryItem = useCallback(
    (jobId: string, itemId: string) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id !== jobId
            ? j
            : {
                ...j,
                status: "running",
                finishedAt: undefined,
                items: j.items.map((it) =>
                  it.id === itemId
                    ? { ...it, status: "pending", message: undefined, finishedAt: undefined }
                    : it,
                ),
              },
        ),
      );
      const job = jobsRef.current.find((j) => j.id === jobId);
      setTimeout(() => runItem(jobId, itemId, job?.docKind ?? "auto", job?.notes), 0);
      setTimeout(() => {
        const j = jobsRef.current.find((x) => x.id === jobId);
        if (j && j.items.every((it) => it.status !== "pending" && it.status !== "uploading")) {
          finalizeJob(jobId);
        }
      }, 50);
    },
    [runItem, finalizeJob],
  );

  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "running");
    if (!hasActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [jobs]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const j of jobs) {
      if (j.status !== "done") continue;
      const hasIssue = j.items.some((it) => it.status === "failed" || it.status === "rejected");
      if (hasIssue) continue;
      const t = setTimeout(() => dismiss(j.id), 5000);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  }, [jobs, dismiss]);

  const value = useMemo<Ctx>(
    () => ({
      jobs,
      enqueue,
      dismiss,
      dismissAllDone,
      retryItem,
      dockOpen,
      setDockOpen,
      dockExpanded,
      setDockExpanded,
    }),
    [jobs, enqueue, dismiss, dismissAllDone, retryItem, dockOpen, dockExpanded],
  );

  return <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>;
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue must be used inside <UploadQueueProvider>");
  return ctx;
}

export function summarizeJob(job: UploadJob) {
  const total = job.items.length;
  const done = job.items.filter((i) => i.status === "done").length;
  const failed = job.items.filter((i) => i.status === "failed").length;
  const rejected = job.items.filter((i) => i.status === "rejected").length;
  const uploading = job.items.filter((i) => i.status === "uploading").length;
  const pending = job.items.filter((i) => i.status === "pending").length;
  const finished = done + failed + rejected;
  const pctDone = total === 0 ? 0 : Math.round((finished / total) * 100);
  const pctInflight = total === 0 ? 0 : Math.round(((finished + uploading) / total) * 100);

  let etaSec: number | null = null;
  const finishedItems = job.items.filter((i) => i.finishedAt && i.startedAt);
  if (finishedItems.length >= 3 && pending + uploading > 0) {
    const avg =
      finishedItems.reduce((s, it) => s + ((it.finishedAt! - it.startedAt!) || 0), 0) /
      finishedItems.length;
    const remaining = pending + uploading;
    etaSec = Math.max(1, Math.round((avg * remaining) / MAX_CONCURRENCY / 1000));
  }

  return { total, done, failed, rejected, uploading, pending, finished, pctDone, pctInflight, etaSec };
}
