import * as React from "react";

/**
 * Workspace + Accounting-mode state for the UI-First architecture.
 *
 * - workspace: "front" (UI-First, dành cho người vận hành / chủ DN)
 *              "back"  (kế toán đầy đủ — sidebar dày, ngôn ngữ kế toán)
 * - accountingMode: bật/tắt hiển thị mã TK (511/331/…) + bút toán Nợ/Có
 *
 * Cả hai đều persist localStorage. Đổi qua custom event để các component
 * cùng phiên cập nhật ngay.
 */

export type Workspace = "front" | "back";

const WS_KEY = "ui:workspace";
const ACC_KEY = "ui:accounting-mode";
const WS_EVT = "ui:workspace-change";
const ACC_EVT = "ui:accounting-mode-change";

function readWorkspace(): Workspace {
  if (typeof window === "undefined") return "front";
  const v = localStorage.getItem(WS_KEY);
  return v === "back" ? "back" : "front";
}

function readAccountingMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ACC_KEY) === "1";
}

export function useWorkspace() {
  const [workspace, setWs] = React.useState<Workspace>("front");

  React.useEffect(() => {
    setWs(readWorkspace());
    const onChange = () => setWs(readWorkspace());
    window.addEventListener(WS_EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(WS_EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setWorkspace = React.useCallback((next: Workspace) => {
    // Cập nhật state ngay để UI đổi mode không phải chờ event/localStorage.
    setWs(next);
    try {
      localStorage.setItem(WS_KEY, next);
    } catch {}
    window.dispatchEvent(new Event(WS_EVT));
  }, []);

  return { workspace, setWorkspace };
}

export function useAccountingMode() {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    setEnabled(readAccountingMode());
    const onChange = () => setEnabled(readAccountingMode());
    window.addEventListener(ACC_EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(ACC_EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setAccountingMode = React.useCallback((next: boolean) => {
    try {
      localStorage.setItem(ACC_KEY, next ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event(ACC_EVT));
  }, []);

  const toggle = React.useCallback(() => {
    setAccountingMode(!readAccountingMode());
  }, [setAccountingMode]);

  return { enabled, setAccountingMode, toggle };
}
