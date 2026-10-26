export type SettingsView = {
  modelConfigurationActive?: boolean;
  model: string;
  models?: string[];
  cutoutModel: string;
  keyMasked: string;
  hasKey: boolean;
  source: "db" | "env" | "none";
  openaiBaseUrlMasked?: string;
  openaiBaseUrlSet?: boolean;
  cutoutBackend?: "openai" | "replicate";
  cutoutReplicateReady?: boolean;
  cutoutReplicateModel?: string;
  cutoutReplicateTokenMasked?: string;
  signupBonus?: number;
  // 微信登录
  wechatAppid?: string;
  wechatToken?: string;
  wechatEmailDomain?: string;
  wechatSecretMasked?: string;
  wechatReady?: boolean;
  // 原生多用户开关
  multiUserEnabled?: boolean;
  // 积分计费开关
  creditsMetering?: boolean;
  // SMTP(忘记密码用)
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpFrom?: string;
  smtpConfigured?: boolean;
  // 支付
  payEnabled?: boolean;
  alipayAppid?: string;
  alipayPublicKey?: string;
  alipayPrivateKeyMasked?: string;
  alipayPrivateKeyReady?: boolean;
  alipayDerivedPublicKey?: string;
  wxpayMchid?: string;
  wxpayApiv3Masked?: string;
  wxpayApiv3Ready?: boolean;
  wxpayCertMasked?: string;
  wxpayCertReady?: boolean;
  wxpayCertSerial?: string;
  wxpayAppid?: string;

  brandName?: string;
  brandLogo?: string;
  pageAbout?: string;
  pageContact?: string;
  pagePlans?: string;
};

