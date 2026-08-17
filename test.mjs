// 本地自检：不启动 harness，直接验证补丁计算与 schema 接受度。
import { Config, EFFORT_LABELS, buildReasoningEfforts, computePatch, isLegacyAutofill, localizeReasoningInfo } from "./lib/index.js";
import { Config as PiAiConfig } from "@deepseek-ai/dsh-llm-pi-ai";
import assert from "node:assert/strict";

// 1) 插件自身配置默认值
const cfg = new Config();
assert.deepEqual(cfg.defaultLevels, ["minimal", "low", "medium", "high", "xhigh", "max"]);
assert.equal(cfg.includeOff, true);
console.log("✓ 插件配置默认值正确:", JSON.stringify(cfg));

// 2) buildReasoningEfforts
const efforts = buildReasoningEfforts(cfg.defaultLevels, cfg.includeOff);
assert.deepEqual(efforts, { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" });
assert.deepEqual(buildReasoningEfforts(["low", "off", "low"], false), { low: "low" });
console.log("✓ buildReasoningEfforts 正确");

// 3) computePatch：模拟用户 settings.yaml 的 maok 路由（真实结构）
const rawUser = {
  providers: {
    maok: {
      displayName: "maok",
      apiKeyEnv: "MAOK_API_KEY",
      api: "openai-responses",
      baseURL: "https://ai.maok.shop/",
      models: [
        { id: "gpt-5.6-sol", name: "gpt-5.6-sol" },
      ],
    },
    "opencode-go": { apiKeyEnv: "OPENCODE_GO_API_KEY" }, // 无 models 列表 = 目录路由，跳过
  },
};
const patch = computePatch(rawUser, cfg);
assert.ok(patch !== null, "应产出补丁");
assert.deepEqual(patch.providers.maok.models[0].reasoningEfforts, efforts);
assert.ok(patch.providers["opencode-go"] === undefined, "目录路由不应被触碰");
console.log("✓ computePatch 产出正确补丁");

// 4) 第一版四档自动配置迁移到六档
const legacyEfforts = { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high" };
assert.equal(isLegacyAutofill(legacyEfforts), true);
assert.equal(isLegacyAutofill({ off: null, high: "high" }), false);
const legacyUser = {
  providers: {
    maok: {
      ...rawUser.providers.maok,
      models: [{ id: "gpt-5.6-sol", name: "gpt-5.6-sol", reasoningEfforts: legacyEfforts }],
    },
  },
};
const migrated = computePatch(legacyUser, cfg);
assert.ok(migrated !== null, "第一版四档应触发迁移");
assert.deepEqual(migrated.providers.maok.models[0].reasoningEfforts, efforts);
console.log("✓ 第一版四档配置自动迁移到六档");

// 5) 幂等：补过之后不再出补丁
const patchedUser = {
  providers: {
    maok: {
      ...rawUser.providers.maok,
      models: patch.providers.maok.models,
    },
  },
};
assert.equal(computePatch(patchedUser, cfg), null, "补写后应无新补丁");
console.log("✓ 幂等：补写后不再重复写");

// 6) 跳过与尊重已有声明
const mixed = {
  providers: {
    maok: {
      models: [
        { id: "a" },
        { id: "b", reasoningEfforts: false },
        { id: "c", reasoningEfforts: { off: null, high: "high" } },
        { id: "d" },
      ],
    },
    skipme: { models: [{ id: "x" }] },
  },
};
const cfgSkip = new Config({ skipRoutes: ["skipme"], skipModels: ["maok/a"] });
const patch2 = computePatch(mixed, cfgSkip);
assert.ok(patch2 !== null, "d 模型应触发补丁");
assert.equal(patch2.providers.maok.models[0].reasoningEfforts, undefined, "skipModels 应跳过");
assert.equal(patch2.providers.maok.models[1].reasoningEfforts, false, "false 声明应保留");
assert.deepEqual(patch2.providers.maok.models[2].reasoningEfforts, { off: null, high: "high" }, "已有声明应保留");
assert.deepEqual(patch2.providers.maok.models[3].reasoningEfforts, efforts, "d 模型应被补写");
assert.equal(patch2.providers.skipme, undefined, "skipRoutes 应跳过");
console.log("✓ 跳过规则与已有声明保护正确");

// 7) 空档位集合（除 off 外）不写
const cfgNone = new Config({ defaultLevels: [], includeOff: true });
assert.equal(computePatch(rawUser, cfgNone), null, "无有效档位时应跳过");
console.log("✓ 空档位集合安全跳过");

// 8) 原生模型信息出口的双语标签
const localized = localizeReasoningInfo({
  provider: "maok",
  id: "gpt-5.6-sol",
  name: "gpt-5.6-sol",
  reasoning: {
    efforts: [
      { id: "minimal", name: "Minimal" },
      { id: "xhigh", name: "Xhigh" },
      { id: "max", name: "Max" },
      { id: "custom", name: "Custom" },
    ],
  },
});
assert.deepEqual(localized.reasoning.efforts.map((e) => e.name), ["Minimal / 最低", "XHigh / 极高", "Max / 最高", "Custom"]);
assert.equal(EFFORT_LABELS.low, "Low / 轻度");
console.log("✓ 推理档位中英双语标签正确");

// 9) 补丁过 pi-ai 的 settings schema（模拟 settings.write 的校验）
const mergedSection = { providers: { maok: patch.providers.maok } };
const resolved = PiAiConfig(mergedSection);
assert.deepEqual(resolved.providers.maok.models[0].reasoningEfforts, efforts);
console.log("✓ 补丁通过 llm-pi-ai settings schema 校验");

console.log("\n全部自检通过 ✔");
