import "server-only";
import { createHash } from "node:crypto";
import { getPool } from "../db";
import { createSupplierLedger } from "./repository";
export const accountIdentity = (endpoint: string, key: string) => createHash("sha256").update(endpoint + "\0" + key).digest("hex");
export const supplierLedger = () => createSupplierLedger(getPool());
