import {z} from 'zod';
import {loginIdentifierToEmail, USERNAME_DOMAIN} from '@/lib/account-identity';

/** Canonical native login identity. Synthetic aliases may contain Chinese. */
export const accountIdentifierSchema=z.string().trim().min(1).max(254)
  .transform(loginIdentifierToEmail)
  .refine(value=>{
    if(value.endsWith(`@${USERNAME_DOMAIN}`))return /^[\p{L}\p{N}_.-]{1,64}$/u.test(value.slice(0,-USERNAME_DOMAIN.length-1));
    return z.string().email().safeParse(value).success;
  },'请输入有效邮箱或花名（中文、字母、数字、点、横线、下划线）');
