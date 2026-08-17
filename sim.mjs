// 运行时仿真：真 Cordis Context + mock settings 服务，跑一遍 apply 全流程。
import { Context } from "@deepseek-ai/cordis";
import { apply, Config } from "./lib/index.js";

const writes = [];
const ctx = new Context();

const mockUser = {
  providers: {
    maok: {
      displayName: "maok",
      apiKeyEnv: "MAOK_API_KEY",
      api: "openai-responses",
      baseURL: "https://ai.maok.shop/",
      models: [{ id: "gpt-5.6-sol", name: "gpt-5.6-sol" }],
    },
  },
};

ctx.provide("settings", {
  describe: () => [{ ns: "llm-pi-ai", revision: 0, user: structuredClone(mockUser), value: {} }],
  update: async (ns, patch, rev) => { writes.push({ ns, patch, rev }); },
  register: (ns, schema, options) => {
    const resolved = schema(options?.base);
    return {
      get: () => resolved,
      watch: () => () => {},
      update: async () => {},
      replace: async () => {},
    };
  },
});

ctx.provide("llm", {
  resolveModelInfo: async (provider, model) => ({
    provider,
    id: model,
    name: model,
    reasoning: { efforts: [{ id: "minimal", name: "Minimal" }, { id: "max", name: "Max" }] },
  }),
});

await ctx.plugin(apply, {});

// 事件触发的补齐路径（模拟"用户新增了模型"）
ctx.emit("settings/updated", "llm-pi-ai", {}, {}, "update");
await new Promise((r) => setTimeout(r, 400));

console.log("writes count:", writes.length);
for (const w of writes) console.log(JSON.stringify(w, null, 2));
console.log("default config:", JSON.stringify(new Config()));
const localized = await ctx.llm.resolveModelInfo("maok", "gpt-5.6-sol");
console.log("localized labels:", localized.reasoning.efforts.map((e) => e.name).join(", "));

await ctx.fiber.dispose();
console.log("disposed ok");
