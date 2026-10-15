import { ROLE_BY_ID } from "../../../packages/rules/src/data.ts";
export function roleCardBack(seat: number, roleId: string) {
  return ROLE_BY_ID[roleId]?.operative
    ? "/assets/role-back-rhodes.webp"
    : `/assets/role-back-${Math.max(0, Math.min(3, seat))}.webp`;
}
