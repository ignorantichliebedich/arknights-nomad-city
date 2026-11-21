export const feedbackKinds = {
  suggestion: "更新建议",
  bug: "漏洞反馈",
  idea: "DIY 灵感",
} as const;
export type FeedbackKind = keyof typeof feedbackKinds;
export const feedbackLimit = 2000;
