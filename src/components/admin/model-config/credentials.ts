"use client";
import {authHeader} from "@/lib/supabase";

export async function encryptCredential(plain: string) {
  if (!crypto.subtle) throw new Error("密钥保存需要 HTTPS 或本地安全连接");
  const response = await fetch("/api/admin/pubkey", {
    cache: "no-store",
    headers: await authHeader(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "获取公钥失败");
  const raw = atob(String(data.pem).replace(/-----[^-]+-----|\s/g, ""));
  const der = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const bytes = new TextEncoder().encode(plain),
    parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 400) {
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        key,
        bytes.slice(i, i + 400),
      ),
    );
    parts.push(
      btoa(Array.from(encrypted, (b) => String.fromCharCode(b)).join("")),
    );
  }
  return parts.join("|");
}
