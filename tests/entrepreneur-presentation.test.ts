import { describe, expect, it } from "vitest";
import { entrepreneurPresentation } from "../apps/web/src/entrepreneur.ts";

describe("企业家身份与立绘", () => {
  it.each([0, 1, 2, 3])("常规玩法第 %i 席沿用本席头像", (seat) => {
    const art = entrepreneurPresentation({ seat });
    expect(art.avatar).toBe(`/assets/avatar-${seat}.webp`);
    expect(art.identity).toBeUndefined();
  });
  it.each(
    [0, 1, 2, 3].flatMap((seat) => [
      { seat, id: "thiago", index: 0 },
      { seat, id: "martin", index: 1 },
      { seat, id: "paul", index: 2 },
      { seat, id: "agnes", index: 3 },
    ]),
  )("第 $seat 席选择 $id 后全部肖像按身份匹配", ({ seat, id, index }) => {
    const art = entrepreneurPresentation({
      seat,
      oripathy: { entrepreneur: id },
    });
    expect(art.id).toBe(id);
    expect(art.avatar).toBe(`/assets/avatar-${index}.webp`);
    expect(art.bust).toBe(`/assets/entrepreneur-bust-${index}.webp`);
    expect(art.portrait).toBe(`/assets/entrepreneur-${index}.webp`);
  });
  it.each([0, 1, 2, 3])("拓荒企业家第 %i 席始终使用原牌剪影", (seat) => {
    const art = entrepreneurPresentation({
      seat,
      oripathy: { entrepreneur: "pioneer" },
    });
    expect(art.silhouette).toBe(true);
    expect(art.name).toBe("拓荒企业家");
    expect(art.avatar).toBe("/assets/oripathy/1402.webp");
    expect(art.bust).toBe(art.avatar);
  });
});
