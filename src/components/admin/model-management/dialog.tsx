"use client";
import {useEffect,useRef} from "react";
import {X} from "lucide-react";
import styles from "./model-management.module.css";

export function Dialog({ title, children, onClose, locked = false }: { title: string; children: React.ReactNode; onClose: () => void; locked?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="model-management-dialog-title" onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <header className={styles.dialogHeader}><h2 id="model-management-dialog-title">{title}</h2><button aria-label="关闭" disabled={locked} onClick={onClose}><X size={20} /></button></header>{children}
  </dialog>;
}
