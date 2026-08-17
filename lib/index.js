// dsh-reasoning-autofill — 给没声明 reasoningEfforts 的第三方模型自动补上推理档位。
//
// 原理：手写声明的 provider 模型（settings.yaml 里 llm-pi-ai.providers.<route>.models）
// 如果没有 reasoningEfforts 字段，dsh-llm-pi-ai 会把该模型的推理能力标为 false，
// 于是输入区模型选择器里「推理设置」整块消失。本插件监听设置与 llm 适配器事件，
// 给这些模型补写默认档位声明（写回 llm-pi-ai 设置），让原生选择器直接显示档位，
// 请求路径的校验也一并放行。只补缺失字段，绝不覆盖用户已写的 reasoningEfforts。
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import Schema from "@deepseek-ai/schemastery";

export const name = "reasoning-autofill";
export const inject = ["settings", "llm"];

const LLM_PI_AI_NS = settingsNamespace("llm-pi-ai");
const NS = settingsNamespace("reasoning-autofill");

/** pi-ai 承认的全部推理档位（与 dsh-llm-pi-ai 的 THINKING_LEVELS 一致）。 */
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export const Config = Schema.object({
  /** 自动补写的档位集合（不含 off，off 由 includeOff 单独控制）。 */
  defaultLevels: Schema.array(Schema.union(THINKING_LEVELS)).default(["minimal", "low", "medium", "high", "xhigh", "max"]),
  /** 是否额外补一个 off 档位（发送时省略 reasoning 参数，即"不思考"）。 */
  includeOff: Schema.boolean().default(true),
  /** 跳过的 provider 路由名（如 maok）。 */
  skipRoutes: Schema.array(Schema.string()).default([]),
  /** 跳过的具体模型，格式 "provider/modelId"。 */
  skipModels: Schema.array(Schema.string()).default([]),
});

/**
 * 构造一个模型的 reasoningEfforts 声明。
 * 键 = 可选档位；值 = 发给 API 的 wire 拼写（与档位同名）。
 * off 特例：值为 null 表示「支持，但发送时省略 reasoning 参数」。
 */
export function buildReasoningEfforts(levels, includeOff) {
  const efforts = {};
  const seen = new Set();
  if (includeOff) efforts["off"] = null;
  for (const level of levels) {
    if (level === "off" || seen.has(level)) continue;
    seen.add(level);
    efforts[level] = level;
  }
  return efforts;
}

/**
 * 从 llm-pi-ai 的「原始用户层」计算需要回写的补丁。
 * @param userSection - ctx.settings.describe() 返回的 user 层（原始文档，未掺入默认值）。
 * @param cfg - 本插件的已解析配置。
 * @returns 传给 ctx.settings.update 的合并补丁；无需改动时返回 null。
 */
/** 第一版插件自动写入的精确签名；仅此形状允许自动迁移，其他已有声明保持不动。 */
const LEGACY_AUTOFILL = Object.freeze({
  off: null,
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
});

export function isLegacyAutofill(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const expected = Object.keys(LEGACY_AUTOFILL);
  return keys.length === expected.length && expected.every((key) => value[key] === LEGACY_AUTOFILL[key]);
}

export function computePatch(userSection, cfg) {
  const providers = userSection?.providers;
  if (providers === null || typeof providers !== "object" || Array.isArray(providers)) return null;
  const skipRoutes = new Set(cfg?.skipRoutes ?? []);
  const skipModels = new Set(cfg?.skipModels ?? []);
  const patchProviders = {};
  for (const [route, profile] of Object.entries(providers)) {
    if (skipRoutes.has(route)) continue;
    if (profile === null || typeof profile !== "object" || !Array.isArray(profile.models)) continue;
    const nextModels = [];
    let changed = false;
    for (const model of profile.models) {
      if (model === null || typeof model !== "object" || typeof model.id !== "string") {
        nextModels.push(model);
        continue;
      }
      if (skipModels.has(route + "/" + model.id)) {
        nextModels.push(model);
        continue;
      }
      const efforts = buildReasoningEfforts(cfg?.defaultLevels ?? [], cfg?.includeOff !== false);
      // 档位集合里除 off 外没有任何档位时不写，避免写出非法配置被 settings 校验拒绝。
      if (Object.keys(efforts).every((level) => level === "off")) {
        nextModels.push(model);
        continue;
      }
      if (model.reasoningEfforts === undefined || isLegacyAutofill(model.reasoningEfforts)) {
        nextModels.push({ ...model, reasoningEfforts: efforts });
        changed = true;
        continue;
      }
      nextModels.push(model);
    }
    if (changed) patchProviders[route] = { ...profile, models: nextModels };
  }
  if (Object.keys(patchProviders).length === 0) return null;
  return { providers: patchProviders };
}

/** 原生选择器显示名：保留英文 effort 名，并追加简体中文。 */
export const EFFORT_LABELS = Object.freeze({
  off: "Off / 关闭",
  minimal: "Minimal / 最低",
  low: "Low / 轻度",
  medium: "Medium / 中等",
  high: "High / 高",
  xhigh: "XHigh / 极高",
  max: "Max / 最高",
});

/** 只改展示名；effort id、默认值和 wire 协议保持不变。 */
export function localizeReasoningInfo(info) {
  if (info?.reasoning === undefined) return info;
  return {
    ...info,
    reasoning: {
      ...info.reasoning,
      efforts: info.reasoning.efforts.map((effort) => ({
        ...effort,
        name: EFFORT_LABELS[effort.id] ?? effort.name,
      })),
    },
  };
}

export function apply(ctx, entry) {
  let current = () => entry;

  let timer;
  let chain = Promise.resolve();
  let retries = 0;

  const schedule = () => {
    clearTimeout(timer);
    // 短延迟合并同一批事件（loader 并发挂载时 pi-ai 命名空间可能晚于本插件注册）。
    timer = setTimeout(run, 50);
    if (typeof timer.unref === "function") timer.unref();
  };

  const run = () => {
    chain = chain.then(async () => {
      const descriptor = ctx.settings.describe().find((d) => d.ns === LLM_PI_AI_NS);
      if (descriptor === undefined) return; // llm-pi-ai 还没注册，等下一次事件
      const patch = computePatch(descriptor.user, current());
      if (patch === null) {
        retries = 0;
        return;
      }
      // 统计真正被补写的模型数（与原始 user 层对比，排除本来就声明过的）。
      let filled = 0;
      const originals = descriptor.user?.providers ?? {};
      for (const [route, profile] of Object.entries(patch.providers)) {
        const before = originals[route]?.models ?? [];
        profile.models.forEach((model, index) => {
          const original = before[index];
          const had = original !== null && typeof original === "object" && original !== undefined && original.reasoningEfforts !== undefined;
          if (!had && model !== null && typeof model === "object" && model.reasoningEfforts !== undefined) filled += 1;
        });
      }
      try {
        await ctx.settings.update(LLM_PI_AI_NS, patch, descriptor.revision);
        ctx.logger.info("reasoning-autofill: 已为 %d 个模型补写 reasoningEfforts（%s）", filled, Object.keys(patch.providers).join(", "));
        retries = 0;
      } catch (error) {
        if (error?.code === "SETTINGS_CONFLICT" && retries < 3) {
          retries += 1;
          schedule();
          return;
        }
        ctx.logger.error("reasoning-autofill: 补写 reasoningEfforts 失败");
        ctx.logger.error(error);
      }
    });
  };

  // 注册本插件自己的设置段（设置页会自动渲染出一张卡）。
  installSettingsSection(ctx, NS, Config, entry, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {
      schedule();
    },
  });

  // 原生模型目录通过这个统一出口取 reasoning.efforts；包装后原位置直接显示中英双语。
  const originalResolveModelInfo = ctx.llm.resolveModelInfo;
  const localizedResolveModelInfo = async function(provider, model, signal) {
    const info = await originalResolveModelInfo.call(this, provider, model, signal);
    return localizeReasoningInfo(info);
  };
  ctx.llm.resolveModelInfo = localizedResolveModelInfo;
  ctx.effect(() => () => {
    if (ctx.llm.resolveModelInfo === localizedResolveModelInfo) ctx.llm.resolveModelInfo = originalResolveModelInfo;
  }, "reasoning-autofill: localized effort labels");

  // llm-pi-ai 命名空间有变化（用户改模型、加模型）时重新补齐。
  ctx.on("settings/updated", (ns) => {
    if (ns === LLM_PI_AI_NS || ns === NS) schedule();
  });
  // pi-ai 适配器注册/更新后，命名空间必然已存在。
  ctx.on("llm/adapters-updated", () => schedule());
  ctx.effect(() => () => clearTimeout(timer), "reasoning-autofill: debounce");
  schedule();
}
